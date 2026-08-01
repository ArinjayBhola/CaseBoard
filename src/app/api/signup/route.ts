import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { conflict } from "@/server/errors";
import { json, parseBody, withoutUser } from "@/server/http";
import { signupSchema } from "@/server/schemas";

export async function POST(req: Request) {
  return withoutUser(async () => {
    const { username, email, password } = await parseBody(req, signupSchema);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict("An account with that email already exists");

    const user = await prisma.user.create({
      data: { username, email, password: await hashPassword(password) },
      select: { id: true, username: true, email: true },
    });

    return json(user, 201);
  });
}
