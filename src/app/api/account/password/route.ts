import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revokeOtherSessions } from "@/lib/sessions/service";
import { badRequest, notFound } from "@/server/errors";
import { parseBody, withUser } from "@/server/http";
import { changePasswordSchema } from "@/server/schemas";

export async function POST(req: Request) {
  return withUser(async (userId) => {
    const { currentPassword, newPassword } = await parseBody(req, changePasswordSchema);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("Account not found");

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) throw badRequest("Current password is incorrect");

    await prisma.user.update({
      where: { id: userId },
      data: { password: await hashPassword(newPassword) },
    });

    // A password change is the standard "lock everyone else out" moment — often
    // the whole reason someone changes it. Revoke every other session (keeping
    // this one); those devices are signed out immediately by their SessionGuard.
    const session = await getServerSession(authOptions);
    const signedOut = await revokeOtherSessions(userId, session?.sessionId ?? null);

    return { ok: true, signedOut };
  });
}
