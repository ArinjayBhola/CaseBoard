import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/server/errors";
import type { createConnectorSchema, updateConnectorSchema } from "@/server/schemas";
import { assertCaseAccess, canAccess, touchCase } from "@/server/services/cases";
import type { z } from "zod";

type CreateConnectorInput = z.infer<typeof createConnectorSchema>;
type UpdateConnectorInput = z.infer<typeof updateConnectorSchema>;

export async function listConnectors(userId: string, caseId: string) {
  await assertCaseAccess(userId, caseId);
  return prisma.connector.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } });
}

export async function createConnector(
  userId: string,
  caseId: string,
  input: CreateConnectorInput,
) {
  await assertCaseAccess(userId, caseId);

  if (input.fromId === input.toId) throw badRequest("A connector needs two different people");

  // Both endpoints must live in this case — otherwise a forged id could link
  // across cases, or to a person that does not exist.
  const endpoints = await prisma.person.findMany({
    where: { id: { in: [input.fromId, input.toId] }, caseId },
    select: { id: true },
  });
  if (endpoints.length !== 2) throw badRequest("Both people must be on this board");

  const connector = await prisma.connector.create({
    data: {
      caseId,
      fromId: input.fromId,
      toId: input.toId,
      label: input.label || null,
      confidence: input.confidence,
      direction: input.direction,
    },
  });

  await touchCase(caseId);
  return connector;
}

async function ownedConnector(userId: string, connectorId: string) {
  const connector = await prisma.connector.findFirst({
    where: { id: connectorId, case: canAccess(userId) },
  });
  if (!connector) throw notFound("Connector not found");
  return connector;
}

export async function updateConnector(
  userId: string,
  connectorId: string,
  input: UpdateConnectorInput,
) {
  const existing = await ownedConnector(userId, connectorId);

  const connector = await prisma.connector.update({
    where: { id: connectorId },
    data: {
      ...(input.label !== undefined ? { label: input.label || null } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.direction !== undefined ? { direction: input.direction } : {}),
    },
  });

  await touchCase(existing.caseId);
  return connector;
}

export async function deleteConnector(userId: string, connectorId: string) {
  const existing = await ownedConnector(userId, connectorId);
  await prisma.connector.delete({ where: { id: connectorId } });
  await touchCase(existing.caseId);
}
