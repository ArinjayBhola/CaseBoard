import { prisma } from "@/lib/prisma";
import { colorForUser } from "@/lib/realtime/token";
import { notFound } from "@/server/errors";
import { withUser } from "@/server/http";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

/** Presence identity for the local user — name and colour shown on their cursor. */
export async function GET() {
  return withUser(async (userId) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true },
    });
    if (!user) throw notFound("Account not found");

    return { name: user.username || user.email.split("@")[0], color: colorForUser(userId) };
  });
}
