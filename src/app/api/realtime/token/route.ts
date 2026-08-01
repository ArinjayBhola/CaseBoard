import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolvePermission } from "@/lib/realtime/permissions";
import { colorForUser, signRealtimeToken } from "@/lib/realtime/token";
import { notFound } from "@/server/errors";
import { json, parseBody, withUser } from "@/server/http";
import { assertCaseAccess } from "@/server/services/cases";

const bodySchema = z.object({ caseId: z.string().min(1) });

/**
 * Mints a short-lived websocket token after confirming the caller can access
 * the case. This is the only place case membership is checked for realtime —
 * the websocket server trusts the signature and the caseId inside it.
 */
export async function POST(req: Request) {
  return withUser(async (userId) => {
    const { caseId } = await parseBody(req, bodySchema);

    await assertCaseAccess(userId, caseId);

    const [user, record] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
      prisma.case.findUnique({ where: { id: caseId }, select: { ownerId: true } }),
    ]);
    if (!user || !record) throw notFound("Account not found");

    const isOwner = record.ownerId === userId;

    const token = await signRealtimeToken({
      userId,
      caseId,
      name: user.email.split("@")[0],
      color: colorForUser(userId),
      isOwner,
    });

    return json({
      token,
      wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:1234",
      // Lets the client render read-only affordances from the first frame,
      // rather than after a round-trip.
      permission: await resolvePermission({ caseId, userId, isOwner }),
    });
  });
}
