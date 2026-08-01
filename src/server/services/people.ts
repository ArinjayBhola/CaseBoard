import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { notFound } from "@/server/errors";
import type { createPersonSchema, movePeopleSchema, updatePersonSchema } from "@/server/schemas";
import { assertCaseAccess, canAccess, touchCase } from "@/server/services/cases";
import { pruneMemberFromGroups } from "@/server/services/groups";
import type { z } from "zod";

type CreatePersonInput = z.infer<typeof createPersonSchema>;
type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
type MovePeopleInput = z.infer<typeof movePeopleSchema>;

/** Normalize tags: trim, drop blanks, dedupe case-insensitively, keep first casing. */
function normalizeTags(tags?: string[] | null): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export async function listPeople(userId: string, caseId: string) {
  await assertCaseAccess(userId, caseId);
  return prisma.person.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } });
}

export async function createPerson(userId: string, caseId: string, input: CreatePersonInput) {
  await assertCaseAccess(userId, caseId);

  const person = await prisma.person.create({
    data: {
      caseId,
      name: input.name,
      photoUrl: input.photoUrl || null,
      notes: input.notes || null,
      tags: normalizeTags(input.tags),
      role: input.role || null,
      location: input.location || null,
      source: input.source || null,
      x: input.x,
      y: input.y,
    },
  });

  await touchCase(caseId);
  return person;
}

/** Loads a person and verifies the acting user has access to its case. */
async function ownedPerson(userId: string, personId: string) {
  const person = await prisma.person.findFirst({
    where: { id: personId, case: canAccess(userId) },
  });
  if (!person) throw notFound("Person not found");
  return person;
}

export async function updatePerson(userId: string, personId: string, input: UpdatePersonInput) {
  const existing = await ownedPerson(userId, personId);

  // Replacing a photo orphans the old file — delete it.
  if (input.photoUrl !== undefined && existing.photoUrl && input.photoUrl !== existing.photoUrl) {
    await deletePhoto(existing.photoUrl);
  }

  const person = await prisma.person.update({
    where: { id: personId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
      ...(input.role !== undefined ? { role: input.role || null } : {}),
      ...(input.location !== undefined ? { location: input.location || null } : {}),
      ...(input.source !== undefined ? { source: input.source || null } : {}),
      ...(input.x !== undefined ? { x: input.x } : {}),
      ...(input.y !== undefined ? { y: input.y } : {}),
    },
  });

  await touchCase(person.caseId);
  return person;
}

export async function deletePerson(userId: string, personId: string) {
  const person = await ownedPerson(userId, personId);
  if (person.photoUrl) await deletePhoto(person.photoUrl);

  // Connectors cascade via the schema; group membership is a plain array, so prune it.
  await pruneMemberFromGroups(person.caseId, personId);

  await prisma.person.delete({ where: { id: personId } });
  await touchCase(person.caseId);
}

/**
 * Batch position write — what the debounced drag autosave calls.
 * Filters to people actually in the given case so a forged id can't move
 * someone else's card.
 */
export async function movePeople(userId: string, caseId: string, input: MovePeopleInput) {
  await assertCaseAccess(userId, caseId);

  const ids = input.positions.map((p) => p.id);
  const owned = await prisma.person.findMany({
    where: { id: { in: ids }, caseId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((p) => p.id));

  const updates = input.positions
    .filter((p) => ownedIds.has(p.id))
    .map((p) => prisma.person.update({ where: { id: p.id }, data: { x: p.x, y: p.y } }));

  if (updates.length === 0) return { updated: 0 };

  await prisma.$transaction(updates);
  await touchCase(caseId);
  return { updated: updates.length };
}

async function deletePhoto(url: string) {
  const store = storage();
  const key = store.keyFromUrl(url);
  if (key) await store.delete(key);
}
