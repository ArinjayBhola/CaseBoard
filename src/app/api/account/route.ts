import { prisma } from "@/lib/prisma";
import { json, withUser } from "@/server/http";

/** Permanently removes the signed-in user and every record owned by them. */
export async function DELETE() {
  return withUser(async (userId) => {
    await prisma.user.delete({ where: { id: userId } });
    return json({ ok: true });
  });
}
