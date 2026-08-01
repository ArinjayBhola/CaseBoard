import { prisma } from "@/lib/prisma";
import { notFound } from "@/server/errors";
import type { createGroupSchema, moveGroupsSchema, updateGroupSchema } from "@/server/schemas";
import { assertCaseAccess, canAccess, touchCase } from "@/server/services/cases";
import type { z } from "zod";

type CreateGroupInput = z.infer<typeof createGroupSchema>;
type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
type MoveGroupsInput = z.infer<typeof moveGroupsSchema>;

/** memberIds is a plain String[], so drop any id that isn't a person in this case. */
async function filterMembers(caseId: string, memberIds: string[]) {
  if (memberIds.length === 0) return [];
  const found = await prisma.person.findMany({
    where: { id: { in: memberIds }, caseId },
    select: { id: true },
  });
  const valid = new Set(found.map((p) => p.id));
  return memberIds.filter((id) => valid.has(id));
}

export async function listGroups(userId: string, caseId: string) {
  await assertCaseAccess(userId, caseId);
  return prisma.group.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } });
}

export async function createGroup(userId: string, caseId: string, input: CreateGroupInput) {
  await assertCaseAccess(userId, caseId);

  const group = await prisma.group.create({
    data: {
      caseId,
      label: input.label,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      memberIds: await filterMembers(caseId, input.memberIds),
    },
  });

  await touchCase(caseId);
  return group;
}

async function ownedGroup(userId: string, groupId: string) {
  const group = await prisma.group.findFirst({
    where: { id: groupId, case: canAccess(userId) },
  });
  if (!group) throw notFound("Group not found");
  return group;
}

export async function updateGroup(userId: string, groupId: string, input: UpdateGroupInput) {
  const existing = await ownedGroup(userId, groupId);

  const group = await prisma.group.update({
    where: { id: groupId },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.x !== undefined ? { x: input.x } : {}),
      ...(input.y !== undefined ? { y: input.y } : {}),
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
      ...(input.memberIds !== undefined
        ? { memberIds: await filterMembers(existing.caseId, input.memberIds) }
        : {}),
    },
  });

  await touchCase(existing.caseId);
  return group;
}

export async function deleteGroup(userId: string, groupId: string) {
  const existing = await ownedGroup(userId, groupId);
  await prisma.group.delete({ where: { id: groupId } });
  await touchCase(existing.caseId);
}

/** Debounced autosave target for group boxes dragged or resized on the board. */
export async function moveGroups(userId: string, caseId: string, input: MoveGroupsInput) {
  await assertCaseAccess(userId, caseId);

  const ids = input.boxes.map((b) => b.id);
  const owned = await prisma.group.findMany({
    where: { id: { in: ids }, caseId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((g) => g.id));

  const updates = input.boxes
    .filter((b) => ownedIds.has(b.id))
    .map((b) =>
      prisma.group.update({
        where: { id: b.id },
        data: { x: b.x, y: b.y, width: b.width, height: b.height },
      }),
    );

  if (updates.length === 0) return { updated: 0 };

  await prisma.$transaction(updates);
  await touchCase(caseId);
  return { updated: updates.length };
}

/**
 * Removes a deleted person from every group that lists them.
 * memberIds has no foreign key, so nothing does this for us.
 */
export async function pruneMemberFromGroups(caseId: string, personId: string) {
  const groups = await prisma.group.findMany({
    where: { caseId, memberIds: { has: personId } },
    select: { id: true, memberIds: true },
  });
  if (groups.length === 0) return;

  await prisma.$transaction(
    groups.map((g) =>
      prisma.group.update({
        where: { id: g.id },
        data: { memberIds: g.memberIds.filter((id) => id !== personId) },
      }),
    ),
  );
}
