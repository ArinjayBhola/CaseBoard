import { prisma } from "@/lib/prisma";
import { canAccess } from "@/server/services/cases";

/**
 * Cross-case search over everything the user can reach — people, connector
 * labels, and group labels. Access is scoped by `canAccess`, so results never
 * leak a case the user isn't on.
 */

export type SearchHit = {
  caseId: string;
  caseTitle: string;
  kind: "person" | "connector" | "group";
  label: string;
  detail: string | null;
  /** Present for people, so the board can centre on the card. */
  personId: string | null;
};

export async function searchAll(userId: string, raw: string): Promise<SearchHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];

  const contains = { contains: q, mode: "insensitive" as const };

  const [people, connectors, groups] = await Promise.all([
    prisma.person.findMany({
      where: {
        case: canAccess(userId),
        OR: [
          { name: contains },
          { role: contains },
          { location: contains },
          { notes: contains },
          { tags: { has: q } },
        ],
      },
      select: {
        id: true,
        name: true,
        role: true,
        caseId: true,
        case: { select: { title: true } },
      },
      take: 20,
    }),
    prisma.connector.findMany({
      where: { case: canAccess(userId), label: contains },
      select: { id: true, label: true, caseId: true, case: { select: { title: true } } },
      take: 10,
    }),
    prisma.group.findMany({
      where: { case: canAccess(userId), label: contains },
      select: { id: true, label: true, caseId: true, case: { select: { title: true } } },
      take: 10,
    }),
  ]);

  const hits: SearchHit[] = [];
  for (const p of people) {
    hits.push({
      caseId: p.caseId,
      caseTitle: p.case.title,
      kind: "person",
      label: p.name,
      detail: p.role,
      personId: p.id,
    });
  }
  for (const c of connectors) {
    if (!c.label) continue;
    hits.push({
      caseId: c.caseId,
      caseTitle: c.case.title,
      kind: "connector",
      label: c.label,
      detail: "connection",
      personId: null,
    });
  }
  for (const g of groups) {
    hits.push({
      caseId: g.caseId,
      caseTitle: g.case.title,
      kind: "group",
      label: g.label,
      detail: "group",
      personId: null,
    });
  }
  return hits;
}
