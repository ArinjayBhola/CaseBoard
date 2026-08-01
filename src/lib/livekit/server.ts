import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";

/**
 * Server-side LiveKit helpers. Never import this from a client component — it
 * holds the API secret.
 */

export const SHARE_IDENTITY_SUFFIX = "__share";

/** LiveKit room name for a case. One room per case, created on demand. */
export function callRoomName(caseId: string) {
  return `case-${caseId}`;
}

/**
 * A screen share connects as its own participant so it can publish from the
 * dedicated /share tab. This tells the two apart.
 */
export function isShareIdentity(identity: string) {
  return identity.endsWith(SHARE_IDENTITY_SUFFIX);
}

export function userIdFromIdentity(identity: string) {
  return identity.endsWith(SHARE_IDENTITY_SUFFIX)
    ? identity.slice(0, -SHARE_IDENTITY_SUFFIX.length)
    : identity;
}

function config() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL ?? "http://localhost:7880";

  if (!apiKey || !apiSecret) {
    throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set");
  }
  return { apiKey, apiSecret, url };
}

/** Public websocket URL the browser connects to. */
export function publicLivekitUrl() {
  return process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "ws://localhost:7880";
}

export type TokenOptions = {
  caseId: string;
  userId: string;
  displayName: string;
  /** Screen-share publishers get a separate identity and cannot send camera/mic. */
  kind: "member" | "share";
};

export async function createCallToken({ caseId, userId, displayName, kind }: TokenOptions) {
  const { apiKey, apiSecret } = config();

  const identity = kind === "share" ? `${userId}${SHARE_IDENTITY_SUFFIX}` : userId;

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: displayName,
    // Long enough for a working session; the room grant is scoped to one case.
    ttl: "4h",
  });

  token.addGrant({
    room: callRoomName(caseId),
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    // The share participant exists only to publish the tab capture — the grant
    // itself forbids it from ever sending camera or microphone.
    canPublishSources:
      kind === "share"
        ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
        : undefined,
  });

  return token.toJwt();
}

let roomService: RoomServiceClient | null = null;

export function rooms() {
  if (roomService) return roomService;
  const { apiKey, apiSecret, url } = config();
  // RoomServiceClient speaks HTTP, not websocket.
  const httpUrl = url.replace(/^ws/, "http");
  roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
  return roomService;
}

/**
 * Identities currently connected to a case's room.
 *
 * This is the authoritative answer to "who is on the call" — the database is
 * only a log, and a crashed or backgrounded browser never gets to tell us it
 * left. Returns null when LiveKit is unreachable so callers can degrade rather
 * than wrongly marking everyone as gone.
 */
export async function liveParticipantIdentities(caseId: string): Promise<Set<string> | null> {
  try {
    const list = await rooms().listParticipants(callRoomName(caseId));
    return new Set(list.map((p) => p.identity));
  } catch (err) {
    // A room that has never been created 404s — that is simply "nobody here".
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found") || message.includes("404")) return new Set();
    console.warn("[livekit] could not list participants:", message);
    return null;
  }
}
