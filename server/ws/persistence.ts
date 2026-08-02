import type { Prisma } from "@prisma/client";
import * as Y from "yjs";
import { docs, getYDoc, type WSSharedDoc } from "y-websocket/bin/utils";
import { parseRoom, type RoomKind } from "../../src/lib/realtime/token";
import {
  isBoardEmpty,
  readBoard,
  readWhiteboardElements,
  seedBoard,
  whiteboardMap,
} from "../../src/lib/realtime/boardDoc";
import { asConfidence, asDirection } from "../../src/lib/realtime/entities";
import { prisma } from "./prisma";
import { storage } from "../../src/lib/storage";

/**
 * Postgres is a periodic snapshot of the Yjs state, not the live write path.
 *
 * Writes happen when: edits go quiet for IDLE_MS, or continuous editing passes
 * CEILING_MS since the last write, or the last client leaves a room.
 */
const IDLE_MS = 5_000;
const CEILING_MS = 30_000;
const TICK_MS = 1_000;

type RoomState = {
  kind: RoomKind;
  caseId: string;
  lastEditAt: number;
  lastWriteAt: number;
  dirty: boolean;
  writing: boolean;
};

const rooms = new Map<string, RoomState>();
/** Rooms whose initial hydration is in flight or complete. */
const hydrating = new Map<string, Promise<void>>();

// ---- Hydration --------------------------------------------------------------

/**
 * Must finish BEFORE setupWSConnection runs: that function sends sync step 1
 * synchronously and never awaits the persistence layer, so a doc hydrated late
 * would briefly present as empty to the joining client.
 *
 * Only the first client into a room pays this cost. Later clients find the doc
 * already in memory and sync from it, which is also the freshest state.
 */
export function ensureRoomLoaded(room: string): Promise<void> {
  const existing = hydrating.get(room);
  if (existing) return existing;

  const promise = hydrate(room).catch((err) => {
    // Drop the cached promise so a later connection can retry instead of
    // inheriting a permanently failed room.
    hydrating.delete(room);
    throw err;
  });
  hydrating.set(room, promise);
  return promise;
}

async function hydrate(room: string) {
  const parsed = parseRoom(room);
  if (!parsed) throw new Error(`Unroutable room: ${room}`);

  // getYDoc registers the doc in the shared `docs` map that setupWSConnection reads.
  const doc = getYDoc(room);

  if (parsed.kind === "board") {
    await hydrateBoard(doc, parsed.caseId);
  } else {
    await hydrateWhiteboard(doc, parsed.caseId);
  }

  const state: RoomState = {
    kind: parsed.kind,
    caseId: parsed.caseId,
    lastEditAt: 0,
    lastWriteAt: Date.now(),
    dirty: false,
    writing: false,
  };
  rooms.set(room, state);

  doc.on("update", (_update: Uint8Array, origin: unknown) => {
    // Ignore our own seeding writes — they already match Postgres.
    if (origin === "seed") return;
    state.lastEditAt = Date.now();
    state.dirty = true;
  });

  console.log(`[ws] room ready: ${room}`);
}

async function hydrateBoard(doc: Y.Doc, caseId: string) {
  const snapshot = await prisma.boardSnapshot.findUnique({ where: { caseId } });

  if (snapshot) {
    Y.applyUpdate(doc, new Uint8Array(snapshot.yjsState), "seed");
    return;
  }

  // No Yjs snapshot yet: this case predates realtime (Phase 1–2) or was just
  // imported. Seed the document from the relational tables once.
  const [people, connectors, groups] = await Promise.all([
    prisma.person.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } }),
    prisma.connector.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } }),
    prisma.group.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!isBoardEmpty(doc)) return;

  seedBoard(doc, {
    people: people.map((p) => ({
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
      confidence: asConfidence(c.confidence),
      direction: asDirection(c.direction),
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
  });
}

async function hydrateWhiteboard(doc: Y.Doc, caseId: string) {
  const snapshot = await prisma.whiteboardSnapshot.findUnique({ where: { caseId } });
  if (snapshot) Y.applyUpdate(doc, new Uint8Array(snapshot.yjsState), "seed");
}

// ---- Writing ----------------------------------------------------------------

async function persist(room: string, doc: Y.Doc, state: RoomState, compact = false) {
  if (state.writing) return;
  state.writing = true;
  // Clear before writing: edits arriving mid-write re-flag the room rather than
  // being swallowed by the flag reset.
  state.dirty = false;

  try {
    const update = compact
      ? compactUpdate(doc, state.kind)
      : Buffer.from(Y.encodeStateAsUpdate(doc));

    if (state.kind === "board") {
      await prisma.boardSnapshot.upsert({
        where: { caseId: state.caseId },
        create: { caseId: state.caseId, yjsState: update },
        update: { yjsState: update },
      });
      await projectBoardToTables(doc, state.caseId);
    } else {
      // The Yjs state keeps Excalidraw's `isDeleted` tombstones — peers need
      // them to learn about deletions. The readable fallback drops them so it
      // reflects what the whiteboard actually looks like.
      const live = readWhiteboardElements(doc).filter((el) => el.isDeleted !== true);
      // Prisma's Json input type can't express "array of arbitrary objects";
      // the value is plain JSON by construction.
      const sceneJson = { elements: live } as unknown as Prisma.InputJsonValue;
      await prisma.whiteboardSnapshot.upsert({
        where: { caseId: state.caseId },
        create: { caseId: state.caseId, yjsState: update, sceneJson },
        update: { yjsState: update, sceneJson },
      });
    }

    await prisma.case.update({
      where: { id: state.caseId },
      data: { updatedAt: new Date() },
    });

    state.lastWriteAt = Date.now();
  } catch (err) {
    // Leave the room dirty so the next tick retries.
    state.dirty = true;
    console.error(`[ws] persist failed for ${room}:`, err);
  } finally {
    state.writing = false;
  }
}

/**
 * Rebuilds the document from its current visible content, discarding edit
 * history and delete-set tombstones.
 *
 * `encodeStateAsUpdate` carries every deletion a document has ever seen, so a
 * long-lived case grows without bound even though the board itself doesn't.
 * Rewriting from the current state throws that away.
 *
 * This resets the document's client ids, which would break sync for anyone
 * mid-session — so it is only ever done when the last client has left the room
 * and there is nobody to desynchronise.
 */
function compactUpdate(doc: Y.Doc, kind: RoomKind): Buffer {
  const fresh = new Y.Doc();

  if (kind === "board") {
    seedBoard(fresh, readBoard(doc));
  } else {
    const target = whiteboardMap(fresh);
    // Tombstones are the delete signal between peers, but once the room is
    // empty nobody needs to be told about deletions that already happened.
    fresh.transact(() => {
      whiteboardMap(doc).forEach((el, id) => {
        if ((el as { isDeleted?: boolean }).isDeleted === true) return;
        target.set(id, el);
      });
    });
  }

  const out = Buffer.from(Y.encodeStateAsUpdate(fresh));
  fresh.destroy();
  return out;
}

/**
 * Mirrors the Yjs board into the relational tables.
 *
 * Without this, everything that still reads Person/Connector/Group — JSON
 * export, dashboard thumbnails and counts, board import — would drift the moment
 * realtime editing began.
 */
async function projectBoardToTables(doc: Y.Doc, caseId: string) {
  const { people, connectors, groups } = readBoard(doc);

  const peopleIds = people.map((p) => p.id);
  const connectorIds = connectors.map((c) => c.id);
  const groupIds = groups.map((g) => g.id);

  // Photos belonging to rows about to disappear are orphaned files — collect
  // them before the delete so they can be removed from storage.
  const doomed = await prisma.person.findMany({
    where: { caseId, id: { notIn: peopleIds.length ? peopleIds : ["__none__"] } },
    select: { photoUrl: true },
  });

  await prisma.$transaction([
    prisma.connector.deleteMany({
      where: { caseId, id: { notIn: connectorIds.length ? connectorIds : ["__none__"] } },
    }),
    prisma.group.deleteMany({
      where: { caseId, id: { notIn: groupIds.length ? groupIds : ["__none__"] } },
    }),
    // Person deletes cascade to any connector still referencing them.
    prisma.person.deleteMany({
      where: { caseId, id: { notIn: peopleIds.length ? peopleIds : ["__none__"] } },
    }),
  ]);

  // People first: connectors have foreign keys onto them.
  for (const p of people) {
    const data = {
      name: p.name,
      photoUrl: p.photoUrl,
      notes: p.notes,
      tags: p.tags,
      role: p.role,
      location: p.location,
      source: p.source,
      x: p.x,
      y: p.y,
    };
    await prisma.person.upsert({
      where: { id: p.id },
      create: { id: p.id, caseId, ...data },
      update: data,
    });
  }

  const validPeople = new Set(peopleIds);

  for (const c of connectors) {
    // A connector can outlive its endpoints for a moment if two clients delete
    // and link concurrently. Skip rather than blow up the whole projection.
    if (!validPeople.has(c.fromId) || !validPeople.has(c.toId)) continue;

    const data = {
      fromId: c.fromId,
      toId: c.toId,
      label: c.label,
      confidence: c.confidence,
      direction: c.direction,
    };
    await prisma.connector.upsert({
      where: { id: c.id },
      create: { id: c.id, caseId, ...data },
      update: data,
    });
  }

  for (const g of groups) {
    const data = {
      label: g.label,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      memberIds: g.memberIds.filter((id) => validPeople.has(id)),
    };
    await prisma.group.upsert({
      where: { id: g.id },
      create: { id: g.id, caseId, ...data },
      update: data,
    });
  }

  await deleteOrphanPhotos(doomed.map((p) => p.photoUrl));
}

/** Remove photos whose person was deleted through Yjs, regardless of driver. */
async function deleteOrphanPhotos(urls: (string | null)[]) {
  for (const url of urls) {
    if (!url) continue;
    const key = storage().keyFromUrl(url);
    if (key) await storage().delete(key);
  }
}

// ---- Scheduling -------------------------------------------------------------

/** Called by @y/websocket-server when the last client leaves a room. */
export async function writeState(room: string, doc: WSSharedDoc) {
  const state = rooms.get(room);
  if (state) {
    // The room is empty, so this is the one safe moment to compact away edit
    // history. Always write, even if not dirty — a clean doc may still be
    // carrying accumulated history from earlier sessions.
    await persist(room, doc, state, true);
    rooms.delete(room);
  }
  // Let a future connection hydrate again — the doc object is destroyed after this.
  hydrating.delete(room);
}

export function startPersistenceLoop() {
  setInterval(() => {
    const now = Date.now();

    for (const [room, state] of rooms) {
      if (!state.dirty || state.writing) continue;

      const idle = now - state.lastEditAt >= IDLE_MS;
      const ceilingHit = now - state.lastWriteAt >= CEILING_MS;
      if (!idle && !ceilingHit) continue;

      const doc = docs.get(room);
      if (!doc) continue;

      void persist(room, doc, state);
    }
  }, TICK_MS);
}

/**
 * Drops a room from memory so the next client rehydrates from Postgres.
 * Used after a JSON import rewrites the relational tables underneath a live room.
 */
export function resetRoom(room: string) {
  const doc = docs.get(room);
  rooms.delete(room);
  hydrating.delete(room);

  if (doc) {
    for (const conn of doc.conns.keys()) {
      try {
        (conn as { close: () => void }).close();
      } catch {
        // Connection already gone.
      }
    }
    docs.delete(room);
    doc.destroy();
  }
}
