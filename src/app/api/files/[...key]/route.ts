import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { canAccess } from "@/server/services/cases";

type Params = { params: { key: string[] } };

/**
 * Serves stored uploads via the storage adapter (currently R2).
 * Files are not served directly from CDN to allow for authorization checks.
 *
 * Authorisation has two paths:
 *  1. Your own uploads (`users/<you>/…`) — always allowed. This also covers a
 *     photo just uploaded but not yet attached to a person card.
 *  2. A photo attached to a person on a case you can access — so co-members of a
 *     shared case see each other's photos and the case thumbnail.
 */
export async function GET(_req: Request, { params }: Params) {
  const userId = await currentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const key = params.key.join("/");

  if (!(await canServe(userId, key))) {
    return new Response("Not found", { status: 404 });
  }

  const file = await storage().get(key);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

async function canServe(userId: string, key: string): Promise<boolean> {
  // Fast path: your own file.
  if (key.startsWith(`users/${userId}/`)) return true;

  // Keys are `users/<ownerId>/people/<uuid>`. The owner segment identifies who
  // uploaded the file.
  const ownerId = key.split("/")[1];
  if (!ownerId) return false;

  // A co-member may view the photo only through a case both they and the file's
  // owner belong to — and only while a person there actually references it.
  const person = await prisma.person.findFirst({
    where: {
      photoUrl: `/api/files/${key}`,
      case: { AND: [canAccess(userId), canAccess(ownerId)] },
    },
    select: { id: true },
  });
  return person !== null;
}
