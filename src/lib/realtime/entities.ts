/**
 * Board entity shapes shared by the React client, the Yjs document helpers, and
 * the websocket server's Postgres projection. Kept free of React and Prisma
 * imports so all three can use it.
 */

/**
 * Edit permission. Declared here rather than alongside the Redis helpers so
 * client bundles can reference it without pulling in a server-only module.
 */
export type Permission = "edit" | "view";

/**
 * A member's baseline edit ceiling on a case. "editor" edits like the owner;
 * "viewer" is read-only whether or not a call is running. Declared here so the
 * websocket server can read it without importing a Next/Prisma module.
 */
export type MemberRole = "editor" | "viewer";
export const MEMBER_ROLES: MemberRole[] = ["editor", "viewer"];

/** Normalises whatever is stored to a known role, defaulting to editor. */
export function asMemberRole(value: unknown): MemberRole {
  return value === "viewer" ? "viewer" : "editor";
}

export type Confidence = "confirmed" | "alleged" | "unconfirmed";
export type Direction = "none" | "forward" | "both";

export type Person = {
  id: string;
  name: string;
  photoUrl: string | null;
  notes: string | null;
  tags: string[];
  role: string | null;
  location: string | null;
  source: string | null;
  x: number;
  y: number;
};

export type Connector = {
  id: string;
  fromId: string;
  toId: string;
  label: string | null;
  confidence: Confidence;
  direction: Direction;
};

export type Group = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  memberIds: string[];
};

export type BoardData = {
  people: Person[];
  connectors: Connector[];
  groups: Group[];
};

export const CONFIDENCE_VALUES: Confidence[] = ["confirmed", "alleged", "unconfirmed"];
export const DIRECTION_VALUES: Direction[] = ["none", "forward", "both"];

export function asConfidence(value: unknown): Confidence {
  return CONFIDENCE_VALUES.includes(value as Confidence)
    ? (value as Confidence)
    : "unconfirmed";
}

export function asDirection(value: unknown): Direction {
  return DIRECTION_VALUES.includes(value as Direction) ? (value as Direction) : "none";
}
