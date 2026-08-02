import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { json, parseBody, withUser } from "@/server/http";
import { updateProfileSchema } from "@/server/schemas";

export async function PATCH(req: Request) {
  return withUser(async (userId) => {
    const { username, imageUrl } = await parseBody(req, updateProfileSchema);
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, imageUrl: true } });
    if (!current) throw new Error("Account not found");
    if (imageUrl !== undefined && imageUrl !== current.imageUrl && current.imageUrl) {
      const key = storage().keyFromUrl(current.imageUrl);
      if (key) await storage().delete(key);
    }
    if (imageUrl && !storage().keyFromUrl(imageUrl)?.startsWith(`users/${userId}/profile/`)) {
      throw new Error("Invalid profile image");
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { ...(username === undefined ? {} : { username }), ...(imageUrl === undefined ? {} : { imageUrl }) },
      select: { username: true, imageUrl: true },
    });
    return json(user);
  });
}
