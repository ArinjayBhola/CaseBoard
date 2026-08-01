import { prisma } from "@/lib/prisma";
import { readBoard, readWhiteboardElements } from "@/lib/realtime/boardDoc";
import { roomName, type RoomKind } from "@/lib/realtime/token";
import { badRequest, notFound } from "@/server/errors";
import { assertCaseAccess } from "@/server/services/cases";
import * as Y from "yjs";

/**
 * Version history reads and restores.
 *
 * Automatic capture happens in the websocket server, which is the only process
 * holding live document state. Everything here operates on stored bytes.
 */

type VersionRow = {
  id: string;
  label: string | null;
  createdAt: Date;
  createdById: string | null;
};

export async function listVersions(userId: string, caseId: string, kind: RoomKind) {
  await assertCaseAccess(userId, caseId);

  const query = {
    where: { caseId },
    orderBy: { createdAt: "desc" as const },
    take: 50,
    select: { id: true, label: true, createdAt: true, createdById: true },
  };

  // Prisma's two delegates are structurally different types, so they cannot
  // share a variable — branch rather than fight the union.
  const rows: VersionRow[] =
    kind === "board"
      ? await prisma.boardVersion.findMany(query)
      : await prisma.whiteboardVersion.findMany(query);

  // Resolve the handful of distinct authors in one query rather than per row.
  const authorIds = [...new Set(rows.map((r) => r.createdById).filter(Boolean))] as string[];
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, email: true },
      })
    : [];
  const byId = new Map(authors.map((a) => [a.id, a.email]));

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.createdAt,
    createdBy: row.createdById ? (byId.get(row.createdById) ?? null) : null,
  }));
}

async function loadVersion(userId: string, caseId: string, kind: RoomKind, versionId: string) {
  await assertCaseAccess(userId, caseId);

  const where = { id: versionId, caseId };
  const version =
    kind === "board"
      ? await prisma.boardVersion.findFirst({ where })
      : await prisma.whiteboardVersion.findFirst({ where });

  if (!version) throw notFound("Version not found");
  return version;
}

/**
 * Decodes a version into plain data for a read-only preview. The live document
 * is never touched.
 */
export async function previewVersion(
  userId: string,
  caseId: string,
  kind: RoomKind,
  versionId: string,
) {
  const version = await loadVersion(userId, caseId, kind, versionId);

  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, new Uint8Array(version.yjsState));

    if (kind === "board") {
      const board = readBoard(doc);
      return { id: version.id, createdAt: version.createdAt, label: version.label, ...board };
    }

    return {
      id: version.id,
      createdAt: version.createdAt,
      label: version.label,
      elements: readWhiteboardElements(doc).filter((el) => el.isDeleted !== true),
    };
  } finally {
    doc.destroy();
  }
}

/** Snapshots the current stored state under a user-supplied name. */
export async function createNamedVersion(
  userId: string,
  caseId: string,
  kind: RoomKind,
  label: string,
) {
  await assertCaseAccess(userId, caseId);

  const snapshot =
    kind === "board"
      ? await prisma.boardSnapshot.findUnique({ where: { caseId } })
      : await prisma.whiteboardSnapshot.findUnique({ where: { caseId } });

  if (!snapshot) {
    throw badRequest("There is nothing saved for this case yet");
  }

  const created = await (kind === "board"
    ? prisma.boardVersion.create({
        data: { caseId, yjsState: snapshot.yjsState, label, createdById: userId },
      })
    : prisma.whiteboardVersion.create({
        data: { caseId, yjsState: snapshot.yjsState, label, createdById: userId },
      }));

  return { id: created.id, label: created.label, createdAt: created.createdAt };
}

/**
 * Restores a version.
 *
 * If the room is live, the websocket server rewrites the shared document so every
 * connected client sees it at once. If nobody is connected, the version is
 * written to the snapshot row instead and the next reader hydrates from it.
 */
export async function restoreVersion(
  userId: string,
  caseId: string,
  kind: RoomKind,
  versionId: string,
) {
  const version = await loadVersion(userId, caseId, kind, versionId);
  const state = Buffer.from(version.yjsState);

  // Keep the pre-restore state, so an accidental restore is itself undoable.
  await createNamedVersion(userId, caseId, kind, "Before restore").catch(() => {
    // Nothing saved yet — not a reason to block the restore.
  });

  const applied = await pushToLiveRoom(kind, caseId, state);

  if (!applied) {
    if (kind === "board") {
      await prisma.boardSnapshot.upsert({
        where: { caseId },
        create: { caseId, yjsState: state },
        update: { yjsState: state },
      });
    } else {
      await prisma.whiteboardSnapshot.upsert({
        where: { caseId },
        create: { caseId, yjsState: state },
        update: { yjsState: state },
      });
    }
  }

  await prisma.case.update({ where: { id: caseId }, data: { updatedAt: new Date() } });

  return { restored: version.id, live: applied };
}

async function pushToLiveRoom(kind: RoomKind, caseId: string, state: Buffer) {
  const base = process.env.WS_INTERNAL_URL;
  const secret = process.env.WS_INTERNAL_SECRET;
  if (!base || !secret) return false;

  try {
    const res = await fetch(
      `${base}/internal/restore?room=${encodeURIComponent(roomName(kind, caseId))}`,
      {
        method: "POST",
        headers: {
          "x-internal-secret": secret,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(state),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { applied?: boolean };
    return body.applied === true;
  } catch (err) {
    console.warn(
      "[versions] could not reach the realtime server:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
