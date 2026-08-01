import { prisma } from "@/lib/prisma";
import {
  createCallToken,
  isShareIdentity,
  liveParticipantIdentities,
  publicLivekitUrl,
} from "@/lib/livekit/server";
import { notFound } from "@/server/errors";
import { assertCaseAccess } from "@/server/services/cases";
import { claimHost, releaseHost } from "@/server/services/permissions";

/**
 * Call bookkeeping.
 *
 * LiveKit is the source of truth for who is actually connected. These tables are
 * a log for the case owner's own records, so every read reconciles against
 * LiveKit first — a browser that crashed or lost power never gets to tell us it
 * left, and without reconciliation those rows would stay open forever.
 */

/** The open session for a case, if there is one. */
async function openSession(caseId: string) {
  return prisma.callSession.findFirst({
    where: { caseId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Closes participant rows for anyone no longer in the LiveKit room, and ends the
 * session when the room is empty.
 *
 * Skipped entirely when LiveKit is unreachable — marking everyone as departed
 * because the media server hiccuped would corrupt the log.
 */
export async function reconcileCall(caseId: string) {
  const session = await openSession(caseId);
  if (!session) return null;

  const live = await liveParticipantIdentities(caseId);
  if (!live) return session;

  // Screen-share publishers are a second connection for the same person, not a
  // separate attendee.
  const presentUserIds = new Set(
    Array.from(live).filter((identity) => !isShareIdentity(identity)),
  );

  const open = await prisma.callParticipant.findMany({
    where: { callSessionId: session.id, leftAt: null },
    select: { id: true, userId: true },
  });

  const departed = open.filter((p) => !presentUserIds.has(p.userId)).map((p) => p.id);
  if (departed.length > 0) {
    await prisma.callParticipant.updateMany({
      where: { id: { in: departed } },
      data: { leftAt: new Date() },
    });
  }

  if (presentUserIds.size === 0) {
    await prisma.callSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });
    // No host means nobody to control access, so every restriction lifts and
    // baseline membership applies again.
    await releaseHost(caseId);
    return null;
  }

  return session;
}

export async function joinCall(userId: string, caseId: string, kind: "member" | "share") {
  await assertCaseAccess(userId, caseId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, username: true },
  });
  if (!user) throw notFound("Account not found");

  const displayName = user.username || user.email.split("@")[0];

  // The share tab is a second connection for someone already counted — it must
  // not open a session or add a participant row of its own.
  if (kind === "share") {
    return {
      token: await createCallToken({ caseId, userId, displayName, kind }),
      url: publicLivekitUrl(),
      identity: `${userId}__share`,
    };
  }

  await reconcileCall(caseId);

  const session =
    (await openSession(caseId)) ?? (await prisma.callSession.create({ data: { caseId } }));

  // Rejoining after a drop reuses the open row rather than logging a second
  // arrival for one continuous presence.
  const existing = await prisma.callParticipant.findFirst({
    where: { callSessionId: session.id, userId, leftAt: null },
    select: { id: true },
  });
  if (!existing) {
    await prisma.callParticipant.create({ data: { callSessionId: session.id, userId } });
  }

  // Whoever gets here first becomes host; everyone else inherits the existing one.
  //
  // Host-claim lives in Redis, which is a live-permission cache, not the call
  // itself. If Redis is down the media call must still connect — without a host,
  // baseline membership applies and everyone keeps edit access, which is the safe
  // default here. Never let a permission-cache outage stop people talking.
  try {
    await claimHost(userId, caseId);
  } catch (err) {
    console.warn(
      "[call] could not claim host (permissions cache down?):",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    token: await createCallToken({ caseId, userId, displayName, kind }),
    url: publicLivekitUrl(),
    identity: userId,
    sessionId: session.id,
  };
}

export async function leaveCall(userId: string, caseId: string) {
  await assertCaseAccess(userId, caseId);

  const session = await openSession(caseId);
  if (!session) return { ok: true };

  await prisma.callParticipant.updateMany({
    where: { callSessionId: session.id, userId, leftAt: null },
    data: { leftAt: new Date() },
  });

  // Whether that was the last person is LiveKit's call, not ours.
  await reconcileCall(caseId);
  return { ok: true };
}

/** Live status plus the log, for the in-case call history panel. */
export async function callStatus(userId: string, caseId: string, historyLimit = 20) {
  await assertCaseAccess(userId, caseId);
  await reconcileCall(caseId);

  const sessions = await prisma.callSession.findMany({
    where: { caseId },
    orderBy: { startedAt: "desc" },
    take: historyLimit,
    include: {
      participants: {
        orderBy: { joinedAt: "asc" },
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });

  const active = sessions.find((s) => s.endedAt === null) ?? null;

  return {
    active: active
      ? {
          id: active.id,
          startedAt: active.startedAt,
          participants: active.participants
            .filter((p) => p.leftAt === null)
            .map((p) => ({ userId: p.user.id, email: p.user.email, joinedAt: p.joinedAt })),
        }
      : null,
    history: sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      participants: s.participants.map((p) => ({
        userId: p.user.id,
        email: p.user.email,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
      })),
    })),
  };
}
