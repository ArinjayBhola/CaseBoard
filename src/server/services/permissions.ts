import { prisma } from "@/lib/prisma";
import {
  beginCallControl,
  endCallControl,
  getHost,
  isCallActive,
  permissionChannel,
  redis,
  resolvePermission,
  setPermission,
  type Permission,
} from "@/lib/realtime/permissions";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { asMemberRole } from "@/lib/realtime/entities";
import { assertCaseAccess, baselineEditAllowed } from "@/server/services/cases";

async function caseOwner(caseId: string) {
  const record = await prisma.case.findUnique({
    where: { id: caseId },
    select: { ownerId: true },
  });
  if (!record) throw notFound("Case not found");
  return record.ownerId;
}

/** The acting user's own permission, plus everything the UI needs to render. */
export async function permissionState(userId: string, caseId: string) {
  await assertCaseAccess(userId, caseId);

  const ownerId = await caseOwner(caseId);
  const isOwner = ownerId === userId;
  const baselineEdit = await baselineEditAllowed(caseId, userId, isOwner);

  const [permission, host, active] = await Promise.all([
    resolvePermission({ caseId, userId, isOwner, baselineEdit }),
    getHost(caseId),
    isCallActive(caseId),
  ]);

  return {
    permission,
    isOwner,
    isHost: host === userId,
    hostUserId: host,
    callActive: active,
  };
}

/** Everyone on the case and their current permission — the host's control list. */
export async function participantPermissions(userId: string, caseId: string) {
  await assertCaseAccess(userId, caseId);

  const record = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      ownerId: true,
      owner: { select: { id: true, email: true } },
      members: { select: { role: true, user: { select: { id: true, email: true } } } },
    },
  });
  if (!record) throw notFound("Case not found");

  const people = [
    { id: record.owner.id, email: record.owner.email, isOwner: true, baselineEdit: true },
    ...record.members.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      isOwner: false,
      baselineEdit: asMemberRole(m.role) !== "viewer",
    })),
  ];

  const host = await getHost(caseId);

  return {
    hostUserId: host,
    viewerIsHost: host === userId,
    participants: await Promise.all(
      people.map(async (person) => ({
        userId: person.id,
        email: person.email,
        isOwner: person.isOwner,
        permission: await resolvePermission({
          caseId,
          userId: person.id,
          isOwner: person.isOwner,
          baselineEdit: person.baselineEdit,
        }),
      })),
    ),
  };
}

/**
 * The host restricts or restores someone's edit access for the duration of the
 * call.
 *
 * Two rules are enforced here rather than in the UI:
 *  - only the host may change anything;
 *  - the case owner can never be demoted, or a guest who started a call could
 *    lock the owner out of their own investigation.
 */
export async function updateParticipantPermission(
  actingUserId: string,
  caseId: string,
  targetUserId: string,
  permission: Permission,
) {
  await assertCaseAccess(actingUserId, caseId);

  const host = await getHost(caseId);
  if (!host) throw badRequest("There is no active call on this case");
  if (host !== actingUserId) throw forbidden("Only the call host can change permissions");

  const ownerId = await caseOwner(caseId);
  if (targetUserId === ownerId && permission === "view") {
    throw forbidden("The case owner always keeps edit access");
  }

  // A viewer's baseline is the ceiling — a host can't promote them during a call.
  if (permission === "edit") {
    const canBaselineEdit = await baselineEditAllowed(caseId, targetUserId, targetUserId === ownerId);
    if (!canBaselineEdit) {
      throw forbidden("That person is a viewer on this case and cannot be granted edit");
    }
  }

  await setPermission(caseId, targetUserId, permission);
  return { userId: targetUserId, permission };
}

/** Called when a call starts. The first person in becomes host. */
export async function claimHost(userId: string, caseId: string) {
  await assertCaseAccess(userId, caseId);
  const host = await beginCallControl(caseId, userId);
  await announceReset(caseId);
  return { hostUserId: host, isHost: host === userId };
}

/** Called when the last participant leaves. Restrictions lift. */
export async function releaseHost(caseId: string) {
  await endCallControl(caseId);
  await announceReset(caseId);
}

/**
 * Tells connected servers and clients that the whole call state changed, rather
 * than one person's permission.
 */
async function announceReset(caseId: string) {
  await redis().publish(
    permissionChannel(caseId),
    JSON.stringify({ caseId, userId: "*", permission: "edit" }),
  );
}

/**
 * Broadcasts that a case's baseline permissions changed (e.g. a member's role
 * was flipped), so the websocket server re-resolves from the database and every
 * connected client re-fetches — the change lands inside the current session
 * rather than on next reconnect.
 */
export async function announceBaselineChange(caseId: string) {
  await announceReset(caseId);
}
