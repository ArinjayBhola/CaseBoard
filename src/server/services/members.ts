import { prisma } from "@/lib/prisma";
import { asMemberRole, type MemberRole } from "@/lib/realtime/entities";
import { badRequest, conflict, notFound } from "@/server/errors";
import { assertCaseAccess, assertCaseOwner } from "@/server/services/cases";
import { announceBaselineChange } from "@/server/services/permissions";

/**
 * Case membership. A CaseMember row grants access; its `role` decides whether
 * that access is edit ("editor", the default) or read-only ("viewer"). Only the
 * owner can add, remove, or change the role of a member.
 */

export async function listMembers(userId: string, caseId: string) {
  await assertCaseAccess(userId, caseId);

  const record = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      ownerId: true,
      owner: { select: { id: true, email: true } },
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
        },
      },
    },
  });
  if (!record) throw notFound("Case not found");

  return {
    owner: { id: record.owner.id, email: record.owner.email },
    members: record.members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      email: m.user.email,
      role: asMemberRole(m.role),
      addedAt: m.createdAt,
    })),
    viewerIsOwner: record.ownerId === userId,
  };
}

/**
 * Invites by email. The invitee must already have an account — there is no
 * email delivery in this phase, so inviting an address with no account would
 * create a membership nobody could ever use.
 */
export async function addMember(
  userId: string,
  caseId: string,
  email: string,
  role: MemberRole = "editor",
) {
  await assertCaseOwner(userId, caseId);

  const normalized = email.trim().toLowerCase();
  const invitee = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, email: true },
  });
  if (!invitee) {
    throw badRequest("No CaseBoard account uses that email address");
  }

  const record = await prisma.case.findUnique({
    where: { id: caseId },
    select: { ownerId: true },
  });
  if (record?.ownerId === invitee.id) throw badRequest("That user already owns this case");

  const existing = await prisma.caseMember.findUnique({
    where: { caseId_userId: { caseId, userId: invitee.id } },
    select: { id: true },
  });
  if (existing) throw conflict("That user is already on this case");

  const member = await prisma.caseMember.create({
    data: { caseId, userId: invitee.id, role },
    select: { id: true, role: true, createdAt: true },
  });

  return {
    id: member.id,
    userId: invitee.id,
    email: invitee.email,
    role: asMemberRole(member.role),
    addedAt: member.createdAt,
  };
}

/** Owner flips a member between editor and viewer. Takes effect live. */
export async function setMemberRole(
  userId: string,
  caseId: string,
  memberId: string,
  role: MemberRole,
) {
  await assertCaseOwner(userId, caseId);

  const member = await prisma.caseMember.findFirst({
    where: { id: memberId, caseId },
    select: { id: true, userId: true },
  });
  if (!member) throw notFound("Member not found");

  await prisma.caseMember.update({ where: { id: member.id }, data: { role } });

  // Push the baseline change so the websocket server re-resolves and the member's
  // UI updates inside the current session rather than on next reconnect.
  await announceBaselineChange(caseId);

  return { id: member.id, userId: member.userId, role };
}

export async function removeMember(userId: string, caseId: string, memberId: string) {
  await assertCaseOwner(userId, caseId);

  const member = await prisma.caseMember.findFirst({
    where: { id: memberId, caseId },
    select: { id: true },
  });
  if (!member) throw notFound("Member not found");

  await prisma.caseMember.delete({ where: { id: memberId } });
}
