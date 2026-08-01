import { prisma } from "@/lib/prisma";
import { json, parseBody, withUser } from "@/server/http";
import { updateUsernameSchema } from "@/server/schemas";

export async function PATCH(req: Request) {
  return withUser(async (userId) => {
    const { username } = await parseBody(req, updateUsernameSchema);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { username },
      select: { username: true },
    });
    return json(user);
  });
}
