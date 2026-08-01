import * as Y from "yjs";
import { docs } from "y-websocket/bin/utils";
import { parseRoom } from "../../src/lib/realtime/token";
import {
  CONNECTORS_KEY,
  GROUPS_KEY,
  PEOPLE_KEY,
  readBoard,
  whiteboardMap,
  writeConnector,
  writeGroup,
  writePerson,
} from "../../src/lib/realtime/boardDoc";
import { prisma } from "./prisma";

/**
 * Version history.
 *
 * Phase 3's BoardSnapshot is a single overwritten row — a backup, not a history.
 * These are point-in-time copies taken while a room is live, which is the only
 * place the current Yjs state exists in memory.
 */

/** How often an active room is eligible for a new version. */
const VERSION_INTERVAL_MS = 5 * 60_000;
const TICK_MS = 30_000;

/** Retention: whichever limit bites first. */
const MAX_VERSIONS_PER_CASE = 50;
const MAX_AGE_DAYS = 30;

/** Last automatic version per room, so a quiet room isn't snapshotted repeatedly. */
const lastVersionAt = new Map<string, number>();
/** Doc state size at the last snapshot, used to skip unchanged rooms. */
const lastSize = new Map<string, number>();

export async function captureVersion(
  caseId: string,
  kind: "board" | "whiteboard",
  state: Buffer,
  label: string | null,
  createdById: string | null,
) {
  if (kind === "board") {
    await prisma.boardVersion.create({
      data: { caseId, yjsState: state, label, createdById },
    });
  } else {
    await prisma.whiteboardVersion.create({
      data: { caseId, yjsState: state, label, createdById },
    });
  }
  await pruneVersions(caseId, kind);
}

/**
 * Enforces retention. Old versions are dropped by age, and whatever survives is
 * capped by count — otherwise a busy case accumulates snapshots forever.
 */
export async function pruneVersions(caseId: string, kind: "board" | "whiteboard") {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60_000);

  // Prisma's two delegates are structurally different types, so a shared
  // `table` variable would be a union TypeScript cannot call. Branch instead.
  if (kind === "board") {
    await prisma.boardVersion.deleteMany({ where: { caseId, createdAt: { lt: cutoff } } });
    const excess = await prisma.boardVersion.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
      skip: MAX_VERSIONS_PER_CASE,
    });
    if (excess.length > 0) {
      await prisma.boardVersion.deleteMany({ where: { id: { in: excess.map((v) => v.id) } } });
    }
    return;
  }

  await prisma.whiteboardVersion.deleteMany({ where: { caseId, createdAt: { lt: cutoff } } });
  const excess = await prisma.whiteboardVersion.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: MAX_VERSIONS_PER_CASE,
  });
  if (excess.length > 0) {
    await prisma.whiteboardVersion.deleteMany({
      where: { id: { in: excess.map((v) => v.id) } },
    });
  }
}

/** Periodic automatic snapshots of every live room. */
export function startVersionLoop() {
  setInterval(() => {
    const now = Date.now();

    for (const [room, doc] of docs) {
      const parsed = parseRoom(room);
      if (!parsed) continue;

      const previous = lastVersionAt.get(room) ?? 0;
      if (now - previous < VERSION_INTERVAL_MS) continue;

      const state = Buffer.from(Y.encodeStateAsUpdate(doc));

      // Cheap change check: an untouched room should not generate versions.
      if (lastSize.get(room) === state.length) {
        lastVersionAt.set(room, now);
        continue;
      }

      lastVersionAt.set(room, now);
      lastSize.set(room, state.length);

      void captureVersion(parsed.caseId, parsed.kind, state, "Auto-save", null).catch((err) =>
        console.error(`[ws] version capture failed for ${room}:`, err),
      );
    }
  }, TICK_MS);
}

/**
 * Replaces a live room's content with an older version and pushes it to everyone
 * connected.
 *
 * Yjs has no "replace the document" operation — applying an old update just
 * merges it back in, leaving anything added since. So the current content is
 * explicitly cleared inside the same transaction as the restore, which peers
 * receive as one atomic update.
 *
 * Returns false when the room is not live, in which case the caller writes the
 * snapshot to Postgres instead and the next reader hydrates from it.
 */
export function restoreIntoLiveRoom(room: string, state: Buffer): boolean {
  const doc = docs.get(room);
  if (!doc) return false;

  const parsed = parseRoom(room);
  if (!parsed) return false;

  const replacement = new Y.Doc();
  Y.applyUpdate(replacement, new Uint8Array(state));

  doc.transact(() => {
    if (parsed.kind === "board") {
      // Board entities are nested Y.Maps. They cannot be moved between
      // documents, so the version is read out as plain data and rebuilt here.
      const restored = readBoard(replacement);

      for (const key of [PEOPLE_KEY, CONNECTORS_KEY, GROUPS_KEY]) {
        const map = doc.getMap(key);
        for (const id of [...map.keys()]) map.delete(id);
      }

      for (const person of restored.people) writePerson(doc, person);
      for (const connector of restored.connectors) writeConnector(doc, connector);
      for (const group of restored.groups) writeGroup(doc, group);
    } else {
      // Whiteboard elements are stored as plain JSON objects already.
      const target = whiteboardMap(doc);
      for (const id of [...target.keys()]) target.delete(id);
      whiteboardMap(replacement).forEach((element, id) => {
        target.set(id, JSON.parse(JSON.stringify(element)));
      });
    }
  }, "restore");

  replacement.destroy();
  return true;
}
