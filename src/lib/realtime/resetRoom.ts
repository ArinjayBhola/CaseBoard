import { roomName, type RoomKind } from "./token";

/**
 * Tells the websocket server to drop a room from memory.
 *
 * Needed when the Next app rewrites the relational tables underneath a live room
 * (JSON import). Without it, the in-memory Yjs doc still holds the old board and
 * would overwrite the freshly imported rows on its next snapshot.
 *
 * Best-effort: if the websocket server is down there is no live room to reset,
 * so a failure here is not an error for the caller.
 */
export async function resetRealtimeRoom(kind: RoomKind, caseId: string) {
  const base = process.env.WS_INTERNAL_URL;
  const secret = process.env.WS_INTERNAL_SECRET;
  if (!base || !secret) return { reset: false, reason: "not configured" };

  const room = roomName(kind, caseId);

  try {
    const res = await fetch(
      `${base}/internal/reset-room?room=${encodeURIComponent(room)}`,
      {
        method: "POST",
        headers: { "x-internal-secret": secret },
        signal: AbortSignal.timeout(3000),
      },
    );
    return { reset: res.ok, reason: res.ok ? undefined : `status ${res.status}` };
  } catch (err) {
    console.warn("[realtime] room reset failed:", err instanceof Error ? err.message : err);
    return { reset: false, reason: "unreachable" };
  }
}
