import { SignJWT, jwtVerify } from "jose";

/**
 * The websocket server runs on its own port, so the browser cannot send it the
 * NextAuth session cookie (different origin, SameSite=Lax). Instead the Next app
 * mints a short-lived token after checking case membership, and the websocket
 * server verifies it with the same secret.
 */

export const TOKEN_TTL_SECONDS = 60 * 10;

export type RealtimeClaims = {
  userId: string;
  caseId: string;
  /** Display name for the presence cursor. */
  name: string;
  /** Stable presence colour. */
  color: string;
  /**
   * Owner of the case. Carried in the token so the websocket server can decide
   * permissions without a database round-trip on every connection — and so the
   * owner keeps edit access even if Redis is down.
   */
  isOwner: boolean;
};

function secretKey() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signRealtimeToken(claims: RealtimeClaims) {
  return new SignJWT({
    caseId: claims.caseId,
    name: claims.name,
    color: claims.color,
    isOwner: claims.isOwner,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyRealtimeToken(token: string): Promise<RealtimeClaims> {
  const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });

  if (!payload.sub || typeof payload.caseId !== "string") {
    throw new Error("Malformed realtime token");
  }

  return {
    userId: payload.sub,
    caseId: payload.caseId,
    name: typeof payload.name === "string" ? payload.name : "Someone",
    color: typeof payload.color === "string" ? payload.color : "#C0714F",
    isOwner: payload.isOwner === true,
  };
}

// ---- Room naming ------------------------------------------------------------

export type RoomKind = "board" | "whiteboard";

/**
 * Board and whiteboard get separate rooms so their updates never interfere.
 * The caseId is embedded so the server can check it against the token.
 */
export function roomName(kind: RoomKind, caseId: string) {
  return `${kind}:${caseId}`;
}

export function parseRoom(room: string): { kind: RoomKind; caseId: string } | null {
  const [kind, ...rest] = room.split(":");
  const caseId = rest.join(":");
  if (!caseId) return null;
  if (kind !== "board" && kind !== "whiteboard") return null;
  return { kind, caseId };
}

/** Warm, muted presence colours — same palette family as the rest of the app. */
const PRESENCE_COLORS = [
  "#C0714F",
  "#CE8C24",
  "#8C8177",
  "#A65C3C",
  "#6B615A",
  "#B5503F",
  "#AC731A",
  "#D08A6B",
];

/** Deterministic per-user colour, so someone keeps the same cursor across sessions. */
export function colorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}
