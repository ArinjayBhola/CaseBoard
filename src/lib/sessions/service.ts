import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/realtime/permissions";
import { parseUserAgent, isMobileAgent } from "./device";
import { lookupGeo } from "./geo";

/**
 * Server-side session records — the data behind the account page's "where you
 * are signed in" list. One row is created per successful sign-in (see the
 * `authorize` callback); the auth JWT carries the row id.
 */

/** Pub/sub channel the account page's live stream listens on. */
export const sessionsChannel = (userId: string) => `user:${userId}:sessions`;

/**
 * Nudge any open session lists for this user to refresh. Best-effort — a Redis
 * outage must never block a login or a sign-out, and the stream re-polls on its
 * own besides.
 */
async function announceSessionsChanged(userId: string) {
  try {
    await redis().publish(sessionsChannel(userId), "1");
  } catch {
    // Live push is a nicety; the list still updates on the stream's next tick.
  }
}

/** Pull the client IP out of request headers (proxy-aware). */
export function clientIp(headers: Headers | Record<string, string | string[] | undefined>): string | null {
  const get = (name: string): string | null => {
    if (headers instanceof Headers) return headers.get(name);
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] ?? null : v ?? null;
  };

  const forwarded = get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return get("x-real-ip");
}

export async function createSession(
  userId: string,
  ip: string | null,
  userAgent: string | null,
): Promise<string> {
  const { device } = parseUserAgent(userAgent);
  const geo = await lookupGeo(ip);

  const row = await prisma.userSession.create({
    data: {
      userId,
      ip,
      userAgent,
      device,
      city: geo.city,
      country: geo.country,
    },
    select: { id: true },
  });
  await announceSessionsChanged(userId);
  return row.id;
}

export type SessionView = {
  id: string;
  device: string;
  mobile: boolean;
  ip: string | null;
  location: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

export async function listSessions(
  userId: string,
  currentSid: string | null,
): Promise<SessionView[]> {
  const rows = await prisma.userSession.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
  });

  return rows.map((r) => {
    const location =
      r.city && r.country
        ? `${r.city}, ${r.country}`
        : r.city ?? r.country ?? null;
    return {
      id: r.id,
      device: r.device ?? "Unknown device",
      mobile: isMobileAgent(r.userAgent ?? ""),
      ip: r.ip,
      location,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      current: r.id === currentSid,
    };
  });
}

/** Revoke one session. Scoped to the owner so nobody can drop someone else's. */
export async function revokeSession(userId: string, sessionId: string): Promise<number> {
  const { count } = await prisma.userSession.deleteMany({
    where: { id: sessionId, userId },
  });
  if (count > 0) await announceSessionsChanged(userId);
  return count;
}

/** Sign out everywhere except the caller's current session. */
export async function revokeOtherSessions(
  userId: string,
  currentSid: string | null,
): Promise<number> {
  const { count } = await prisma.userSession.deleteMany({
    where: { userId, id: currentSid ? { not: currentSid } : undefined },
  });
  if (count > 0) await announceSessionsChanged(userId);
  return count;
}
