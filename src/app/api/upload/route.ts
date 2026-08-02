import { storage, userKeyPrefix } from "@/lib/storage";
import { badRequest } from "@/server/errors";
import { json, withUser } from "@/server/http";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

export async function POST(req: Request) {
  return withUser(async (userId) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");

    if (!file || typeof file === "string") throw badRequest("No file uploaded");
    if (!ALLOWED.has(file.type)) {
      throw badRequest("File must be a JPEG, PNG, WebP, GIF image, or PDF");
    }
    if (file.size > MAX_BYTES) throw badRequest("Photo must be under 5 MB");

    const data = Buffer.from(await file.arrayBuffer());
    const result = await storage().put({
      data,
      filename: file.name || "upload",
      contentType: file.type,
      // Keys are namespaced by owner so /api/files can authorise by prefix.
      prefix: userKeyPrefix(userId, form?.get("scope") === "profile" ? "profile" : "people"),
    });

    return json(result, 201);
  });
}
