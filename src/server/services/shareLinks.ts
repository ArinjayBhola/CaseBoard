import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { asConfidence, asDirection, type BoardData } from "@/lib/realtime/entities";
import { redis } from "@/lib/realtime/permissions";
import { badRequest } from "@/server/errors";
import { assertCaseOwner } from "@/server/services/cases";

/**
 * Public, view-only share links.
 *
 * A link is a random token that anyone can open — no account required — to see a
 * read-only snapshot of a case's board. Exactly one link exists per case at a
 * time; regenerating mints a fresh token, which invalidates the previous URL.
 *
 * Two controls, both checked on every access so they bite immediately, even for
 * someone already viewing:
 *  - expiry — default one hour, can be infinite or a custom length;
 *  - revoke — the owner deletes the link outright.
 */

export type ShareDuration =
  | { kind: "preset"; preset: "1h" | "infinite" }
  | { kind: "custom"; minutes: number };

export type ShareLinkStatus = {
  token: string;
  url: string;
  expiresAt: string | null;
  createdAt: string;
  /** People who have loaded the link in the last ~45s. Best-effort. */
  viewerCount: number;
};

// ---- Live viewer count (best-effort, via Redis) -----------------------------

const VIEWER_WINDOW_MS = 45_000;
const viewersKey = (token: string) => `share:viewers:${token}`;

/** Record a heartbeat from a viewer. Cosmetic, so failures are swallowed. */
export async function recordShareView(token: string, viewerId: string) {
  try {
    const r = redis();
    const now = Date.now();
    await r.zadd(viewersKey(token), now, viewerId);
    await r.zremrangebyscore(viewersKey(token), 0, now - VIEWER_WINDOW_MS);
    await r.expire(viewersKey(token), 120);
  } catch {
    // Redis down — viewer count just reads as 0.
  }
}

async function countShareViewers(token: string): Promise<number> {
  try {
    const r = redis();
    await r.zremrangebyscore(viewersKey(token), 0, Date.now() - VIEWER_WINDOW_MS);
    return await r.zcard(viewersKey(token));
  } catch {
    return 0;
  }
}

function newToken() {
  // URL-safe, unguessable. 24 bytes → 32 base64url chars.
  return randomBytes(24).toString("base64url");
}

function expiryFrom(duration: ShareDuration): Date | null {
  if (duration.kind === "custom") {
    if (!Number.isFinite(duration.minutes) || duration.minutes <= 0) {
      throw badRequest("Enter how many minutes the link should stay open");
    }
    return new Date(Date.now() + duration.minutes * 60_000);
  }
  if (duration.preset === "infinite") return null;
  return new Date(Date.now() + 60 * 60_000); // 1h default
}

/** Public base URL used when building the shareable link. */
function appOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function toStatus(
  link: { token: string; expiresAt: Date | null; createdAt: Date },
  viewerCount = 0,
): ShareLinkStatus {
  return {
    token: link.token,
    url: `${appOrigin()}/share/${link.token}`,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    createdAt: link.createdAt.toISOString(),
    viewerCount,
  };
}

/** Owner-only: the current active link, or null if none exists. */
export async function getShareLink(
  userId: string,
  caseId: string,
): Promise<ShareLinkStatus | null> {
  await assertCaseOwner(userId, caseId);
  const link = await prisma.caseShareLink.findUnique({ where: { caseId } });
  if (!link) return null;
  // An expired link is treated as gone — surface it as "no active link".
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return null;
  return toStatus(link, await countShareViewers(link.token));
}

/** Owner-only: create or regenerate the link, replacing any previous token. */
export async function createShareLink(
  userId: string,
  caseId: string,
  duration: ShareDuration,
): Promise<ShareLinkStatus> {
  await assertCaseOwner(userId, caseId);

  const token = newToken();
  const expiresAt = expiryFrom(duration);

  const link = await prisma.caseShareLink.upsert({
    where: { caseId },
    create: { caseId, token, expiresAt, createdById: userId },
    update: { token, expiresAt, createdById: userId, createdAt: new Date() },
  });

  return toStatus(link);
}

/** Owner-only: kill the link now. A viewer's next check fails and locks them out. */
export async function revokeShareLink(userId: string, caseId: string) {
  await assertCaseOwner(userId, caseId);
  await prisma.caseShareLink.deleteMany({ where: { caseId } });
  return { ok: true };
}

export type SharedBoardResult =
  | { status: "ok"; caseTitle: string; board: BoardData; expiresAt: string | null }
  | { status: "expired" }
  | { status: "notfound" };

/**
 * Public: resolve a token to a read-only board snapshot. Enforces revoke (the
 * row is gone) and expiry (checked here), so access ends the moment either does.
 *
 * Photos are deliberately dropped — serving them needs an authenticated session,
 * and a public viewer should see the graph without pulling private image files.
 */
export async function fetchSharedBoard(token: string): Promise<SharedBoardResult> {
  const link = await prisma.caseShareLink.findUnique({
    where: { token },
    select: { caseId: true, expiresAt: true },
  });
  if (!link) return { status: "notfound" };
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return { status: "expired" };

  const [record, people, connectors, groups] = await Promise.all([
    prisma.case.findUnique({ where: { id: link.caseId }, select: { title: true } }),
    prisma.person.findMany({ where: { caseId: link.caseId }, orderBy: { createdAt: "asc" } }),
    prisma.connector.findMany({ where: { caseId: link.caseId }, orderBy: { createdAt: "asc" } }),
    prisma.group.findMany({ where: { caseId: link.caseId }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!record) return { status: "notfound" };

  const board: BoardData = {
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      photoUrl: null, // private; not served to anonymous viewers
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
  };

  return {
    status: "ok",
    caseTitle: record.title,
    board,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
  };
}
