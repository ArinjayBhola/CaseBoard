import { prisma } from "@/lib/prisma";
import { asMemberRole, type MemberRole } from "@/lib/realtime/entities";
import { storage } from "@/lib/storage";
import { notFound } from "@/server/errors";
import type { createCaseSchema, updateCaseSchema } from "@/server/schemas";
import type { z } from "zod";

type CreateCaseInput = z.infer<typeof createCaseSchema>;
type UpdateCaseInput = z.infer<typeof updateCaseSchema>;

/**
 * Access rule: the owner, plus anyone with a CaseMember row. Access means the
 * case is visible; whether it is editable is a separate question — see
 * `baselineEditAllowed`.
 */
export const canAccess = (userId: string) => ({
  OR: [{ ownerId: userId }, { members: { some: { userId } } }],
});

export type { MemberRole };

/**
 * Baseline edit right for a user who already has access. Owners and members
 * with the "editor" role edit; "viewer" members are read-only. Used by both the
 * Next API and the websocket enforcement layer through `resolvePermission`.
 */
export async function baselineEditAllowed(
  caseId: string,
  userId: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return true;
  const member = await prisma.caseMember.findUnique({
    where: { caseId_userId: { caseId, userId } },
    select: { role: true },
  });
  // A non-owner with access always has a member row; if it is somehow missing,
  // deny edit rather than assume it.
  if (!member) return false;
  return asMemberRole(member.role) !== "viewer";
}

export async function listCases(userId: string) {
  const cases = await prisma.case.findMany({
    where: canAccess(userId),
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { people: true, members: true } },
      // First person photo doubles as the case thumbnail.
      people: {
        where: { photoUrl: { not: null } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { photoUrl: true },
      },
    },
  });

  return cases.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    personCount: c._count.people,
    thumbnailUrl: c.people[0]?.photoUrl ?? null,
    isOwner: c.ownerId === userId,
    memberCount: c._count.members,
  }));
}

/** Throws 404 when the case does not exist or the user has no access to it. */
export async function getCase(userId: string, caseId: string) {
  const found = await prisma.case.findFirst({
    where: { id: caseId, ...canAccess(userId) },
    include: { people: { orderBy: { createdAt: "asc" } } },
  });
  if (!found) throw notFound("Case not found");
  return found;
}

/** Access check without loading people. Used by person/connector/group routes. */
export async function assertCaseAccess(userId: string, caseId: string) {
  const found = await prisma.case.findFirst({
    where: { id: caseId, ...canAccess(userId) },
    select: { id: true },
  });
  if (!found) throw notFound("Case not found");
  return found.id;
}

/** Destructive case-level actions stay with the owner. */
export async function assertCaseOwner(userId: string, caseId: string) {
  const found = await prisma.case.findFirst({
    where: { id: caseId, ownerId: userId },
    select: { id: true },
  });
  if (!found) throw notFound("Case not found");
  return found.id;
}

export async function createCase(userId: string, input: CreateCaseInput) {
  return prisma.case.create({
    data: {
      title: input.title,
      description: input.description || null,
      ownerId: userId,
    },
  });
}

export async function updateCase(userId: string, caseId: string, input: UpdateCaseInput) {
  await assertCaseAccess(userId, caseId);
  return prisma.case.update({
    where: { id: caseId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
    },
  });
}

export async function deleteCase(userId: string, caseId: string) {
  // Deleting the whole case is owner-only — members can edit its contents, not
  // destroy the case itself.
  await assertCaseOwner(userId, caseId);

  // Clean up photos before the cascade drops the rows that reference them.
  const people = await prisma.person.findMany({
    where: { caseId, photoUrl: { not: null } },
    select: { photoUrl: true },
  });
  const store = storage();
  await Promise.all(
    people.map(async (p) => {
      const key = p.photoUrl ? store.keyFromUrl(p.photoUrl) : null;
      if (key) await store.delete(key);
    }),
  );

  await prisma.case.delete({ where: { id: caseId } });
}

/** Bump updatedAt so the dashboard's "last edited" reflects board activity. */
export function touchCase(caseId: string) {
  return prisma.case.update({ where: { id: caseId }, data: { updatedAt: new Date() } });
}
