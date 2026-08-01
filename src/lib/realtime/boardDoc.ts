import * as Y from "yjs";
import {
  asConfidence,
  asDirection,
  type BoardData,
  type Connector,
  type Group,
  type Person,
} from "./entities";

/**
 * Yjs layout for an investigation board.
 *
 * Entities live in Y.Maps keyed by id (not Y.Arrays) so two people editing
 * different fields of the same card, or different cards, never conflict —
 * only a genuine same-field collision falls back to last-write-wins.
 *
 * Scalar fields are stored directly on each entity's Y.Map. `tags` and
 * `memberIds` are stored as whole arrays: they're only ever edited as a unit in
 * a modal, so per-item CRDT merging would buy nothing.
 */

export const PEOPLE_KEY = "people";
export const CONNECTORS_KEY = "connectors";
export const GROUPS_KEY = "groups";

export type YEntity = Y.Map<unknown>;
export type YEntityMap = Y.Map<YEntity>;

export const peopleMap = (doc: Y.Doc): YEntityMap => doc.getMap(PEOPLE_KEY);
export const connectorsMap = (doc: Y.Doc): YEntityMap => doc.getMap(CONNECTORS_KEY);
export const groupsMap = (doc: Y.Doc): YEntityMap => doc.getMap(GROUPS_KEY);

// ---- Reading ---------------------------------------------------------------

const str = (m: YEntity, k: string): string => {
  const v = m.get(k);
  return typeof v === "string" ? v : "";
};

const nullableStr = (m: YEntity, k: string): string | null => {
  const v = m.get(k);
  return typeof v === "string" && v.length > 0 ? v : null;
};

const num = (m: YEntity, k: string, fallback = 0): number => {
  const v = m.get(k);
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
};

const strArray = (m: YEntity, k: string): string[] => {
  const v = m.get(k);
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
};

export function readPerson(id: string, m: YEntity): Person {
  return {
    id,
    name: str(m, "name"),
    photoUrl: nullableStr(m, "photoUrl"),
    notes: nullableStr(m, "notes"),
    tags: strArray(m, "tags"),
    role: nullableStr(m, "role"),
    location: nullableStr(m, "location"),
    source: nullableStr(m, "source"),
    x: num(m, "x"),
    y: num(m, "y"),
  };
}

export function readConnector(id: string, m: YEntity): Connector {
  return {
    id,
    fromId: str(m, "fromId"),
    toId: str(m, "toId"),
    label: nullableStr(m, "label"),
    confidence: asConfidence(m.get("confidence")),
    direction: asDirection(m.get("direction")),
  };
}

export function readGroup(id: string, m: YEntity): Group {
  return {
    id,
    label: str(m, "label"),
    x: num(m, "x"),
    y: num(m, "y"),
    width: num(m, "width", 200),
    height: num(m, "height", 200),
    memberIds: strArray(m, "memberIds"),
  };
}

/** Whole board as plain objects — what React renders and Postgres persists. */
export function readBoard(doc: Y.Doc): BoardData {
  const people: Person[] = [];
  peopleMap(doc).forEach((m, id) => people.push(readPerson(id, m)));

  const connectors: Connector[] = [];
  connectorsMap(doc).forEach((m, id) => connectors.push(readConnector(id, m)));

  const groups: Group[] = [];
  groupsMap(doc).forEach((m, id) => groups.push(readGroup(id, m)));

  // Stable order so React keys and diffing behave; Y.Map iteration is unordered.
  people.sort((a, b) => a.id.localeCompare(b.id));
  connectors.sort((a, b) => a.id.localeCompare(b.id));
  groups.sort((a, b) => a.id.localeCompare(b.id));

  return { people, connectors, groups };
}

// ---- Writing ---------------------------------------------------------------

function entityFrom(fields: Record<string, unknown>): YEntity {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(fields)) m.set(k, v);
  return m;
}

export function writePerson(doc: Y.Doc, person: Person) {
  const { id, ...fields } = person;
  peopleMap(doc).set(id, entityFrom(fields));
}

export function writeConnector(doc: Y.Doc, connector: Connector) {
  const { id, ...fields } = connector;
  connectorsMap(doc).set(id, entityFrom(fields));
}

export function writeGroup(doc: Y.Doc, group: Group) {
  const { id, ...fields } = group;
  groupsMap(doc).set(id, entityFrom(fields));
}

/** Patches individual fields, leaving concurrent edits to other fields intact. */
export function patchEntity(map: YEntityMap, id: string, patch: Record<string, unknown>) {
  const entity = map.get(id);
  if (!entity) return;
  for (const [k, v] of Object.entries(patch)) entity.set(k, v);
}

/**
 * Fills an empty document from a Postgres snapshot. Only used when a room has
 * never been opened before — after that the Yjs state is authoritative.
 */
export function seedBoard(doc: Y.Doc, data: BoardData) {
  doc.transact(() => {
    for (const person of data.people) writePerson(doc, person);
    for (const connector of data.connectors) writeConnector(doc, connector);
    for (const group of data.groups) writeGroup(doc, group);
  }, "seed");
}

export function isBoardEmpty(doc: Y.Doc) {
  return (
    peopleMap(doc).size === 0 &&
    connectorsMap(doc).size === 0 &&
    groupsMap(doc).size === 0
  );
}

// ---- Whiteboard -------------------------------------------------------------

export const WHITEBOARD_ELEMENTS_KEY = "elements";

/** Excalidraw elements keyed by element id, values are plain scene objects. */
export const whiteboardMap = (doc: Y.Doc): Y.Map<Record<string, unknown>> =>
  doc.getMap(WHITEBOARD_ELEMENTS_KEY);

export function readWhiteboardElements(doc: Y.Doc): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  whiteboardMap(doc).forEach((el) => out.push(el));
  return out;
}
