import { json, parseBody, withUser } from "@/server/http";
import { createCaseSchema } from "@/server/schemas";
import { createCase, listCases } from "@/server/services/cases";

// Reads the session cookie, so it can never be prerendered.
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser((userId) => listCases(userId));
}

export async function POST(req: Request) {
  return withUser(async (userId) => {
    const input = await parseBody(req, createCaseSchema);
    return json(await createCase(userId, input), 201);
  });
}
