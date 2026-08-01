import { prisma } from "@/lib/prisma";
import { resetRealtimeRoom } from "@/lib/realtime/resetRoom";
import { ownsUploadUrl, storage } from "@/lib/storage";
import { badRequest, conflict } from "@/server/errors";
import type { importRequestSchema } from "@/server/schemas";
import { assertCaseAccess, getCase, touchCase } from "@/server/services/cases";
import type { z } from "zod";

type ImportInput = z.infer<typeof importRequestSchema>;

/** Version stamp so a future import can tell which shape it is reading. */
export const EXPORT_FORMAT = "caseboard.board.v1";

/**
 * Full board state in the documented export shape:
 * { case, people, connectors, groups }
 */
export async function exportBoard(userId: string, caseId: string) {
  const record = await getCase(userId, caseId);

  const [connectors, groups] = await Promise.all([
    prisma.connector.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } }),
    prisma.group.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    format: EXPORT_FORMAT,
    case: {
      id: record.id,
      title: record.title,
      description: record.description,
      exportedAt: new Date().toISOString(),
    },
    people: record.people.map((p) => ({
      id: p.id,
      name: p.name,
      photoUrl: p.photoUrl,
      notes: p.notes,
      tags: p.tags,
      role: p.role,
      location: p.location,
      source: p.source,
      x: p.x,
      y: p.y,
    })),
    connectors: connectors.map((c) => ({
      id: c.id,
      fromId: c.fromId,
      toId: c.toId,
      label: c.label,
      confidence: c.confidence,
      direction: c.direction ?? "none",
    })),
    groups: groups.map((g) => ({
      id: g.id,
      label: g.label,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      memberIds: g.memberIds,
    })),
  };
}

/** Counts used by the client to warn before an overwrite. */
export async function boardStats(userId: string, caseId: string) {
  await assertCaseAccess(userId, caseId);
  const [people, connectors, groups] = await Promise.all([
    prisma.person.count({ where: { caseId } }),
    prisma.connector.count({ where: { caseId } }),
    prisma.group.count({ where: { caseId } }),
  ]);
  return { people, connectors, groups };
}

/**
 * Writes an exported board into a case.
 *
 * Ids in the file are local references only — every person gets a fresh cuid and
 * connectors/groups are rewired to the new ids, so the same file can be imported
 * into several cases without collisions.
 *
 * Photo URLs survive only when the importing user owns the underlying file.
 * Importing someone else's export drops their photos rather than embedding
 * links this user is not allowed to fetch.
 */
export async function importBoard(userId: string, caseId: string, input: ImportInput) {
  await assertCaseAccess(userId, caseId);

  const existing = await boardStats(userId, caseId);
  const hasData = existing.people > 0 || existing.connectors > 0 || existing.groups > 0;

  if (hasData && !input.replace) {
    throw conflict(
      `This board already has ${existing.people} people, ${existing.connectors} connectors and ${existing.groups} groups. Re-send with replace to overwrite it.`,
    );
  }

  const board = input.board;

  // Reject a file whose connectors point at people it does not contain, rather
  // than silently importing a board with missing links.
  const sourceIds = new Set(board.people.map((p) => p.id));
  const danglingConnector = board.connectors.find(
    (c) => !sourceIds.has(c.fromId) || !sourceIds.has(c.toId),
  );
  if (danglingConnector) {
    throw badRequest("This file has connectors referring to people it doesn't contain");
  }

  if (hasData) await wipeBoard(caseId);

  // Person ids must exist before connectors reference them, so create people
  // first with ids we generate, then map the file's ids onto them.
  const created = await prisma.$transaction(
    board.people.map((p) =>
      prisma.person.create({
        data: {
          caseId,
          name: p.name,
          photoUrl: p.photoUrl && ownsUploadUrl(userId, p.photoUrl) ? p.photoUrl : null,
          notes: p.notes || null,
          tags: p.tags ?? [],
          role: p.role || null,
          location: p.location || null,
          source: p.source || null,
          x: p.x,
          y: p.y,
        },
        select: { id: true },
      }),
    ),
  );

  const idMap = new Map<string, string>();
  board.people.forEach((p, i) => idMap.set(p.id, created[i].id));

  if (board.connectors.length > 0) {
    await prisma.connector.createMany({
      data: board.connectors.map((c) => ({
        caseId,
        fromId: idMap.get(c.fromId)!,
        toId: idMap.get(c.toId)!,
        label: c.label || null,
        confidence: c.confidence,
        direction: c.direction ?? "none",
      })),
    });
  }

  if (board.groups.length > 0) {
    await prisma.group.createMany({
      data: board.groups.map((g) => ({
        caseId,
        label: g.label,
        x: g.x,
        y: g.y,
        width: g.width,
        height: g.height,
        // Silently drop member ids the file didn't define a person for.
        memberIds: g.memberIds.map((id) => idMap.get(id)).filter((id): id is string => !!id),
      })),
    });
  }

  await touchCase(caseId);

  // Import writes the relational tables directly, so the realtime layer has to
  // be told to forget the old board:
  //  1. Drop the Yjs snapshot — hydration prefers it over the relational tables,
  //     so leaving it would resurrect the pre-import board.
  //  2. Drop the live room — its in-memory doc would otherwise overwrite the
  //     rows we just wrote on its next scheduled snapshot.
  await prisma.boardSnapshot.deleteMany({ where: { caseId } });
  await resetRealtimeRoom("board", caseId);

  return {
    people: board.people.length,
    connectors: board.connectors.length,
    groups: board.groups.length,
    replaced: hasData,
  };
}

/** Deletes every board entity in a case, including uploaded photos. */
async function wipeBoard(caseId: string) {
  const people = await prisma.person.findMany({
    where: { caseId, photoUrl: { not: null } },
    select: { photoUrl: true },
  });

  const store = storage();
  await Promise.all(
    people.map(async (p) => {
      const key = p.photoUrl ? store.keyFromUrl(p.photoUrl) : null;
      if (key) await store.delete(key);
    }),
  );

  // Connectors cascade from person deletes, but groups hold plain id arrays.
  await prisma.group.deleteMany({ where: { caseId } });
  await prisma.connector.deleteMany({ where: { caseId } });
  await prisma.person.deleteMany({ where: { caseId } });
}
