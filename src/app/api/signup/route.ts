import { hashPassword } from "@/lib/auth";
import { storage, userKeyPrefix } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { conflict } from "@/server/errors";
import { json, withoutUser } from "@/server/http";
import { signupSchema } from "@/server/schemas";

export async function POST(req: Request) {
  return withoutUser(async () => {
    const form = await req.formData();
    const file = form.get("image");
    const input = signupSchema.parse({
      username: form.get("username"),
      email: form.get("email"),
      password: form.get("password"),
    });

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict("An account with that email already exists");

    const imageFile = file && typeof file !== "string" ? file : null;
    if (file && (!imageFile || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(imageFile.type))) {
      throw new Error("Profile photo must be a JPEG, PNG, WebP, or GIF image");
    }
    if (imageFile && imageFile.size > 5 * 1024 * 1024) throw new Error("Profile photo must be under 5 MB");

    const user = await prisma.user.create({
      data: { username: input.username, email: input.email, password: await hashPassword(input.password) },
      select: { id: true, username: true, email: true },
    });

    let imageUrl: string | null = null;
    if (imageFile) {
      const uploaded = await storage().put({ data: Buffer.from(await imageFile.arrayBuffer()), filename: imageFile.name || "profile", contentType: imageFile.type, prefix: userKeyPrefix(user.id, "profile") });
      imageUrl = uploaded.url;
      await prisma.user.update({ where: { id: user.id }, data: { imageUrl } });
    }

    return json({ ...user, imageUrl }, 201);
  });
}
