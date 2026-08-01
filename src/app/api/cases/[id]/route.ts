import { parseBody, withUser } from "@/server/http";
import { updateCaseSchema } from "@/server/schemas";
import { deleteCase, getCase, updateCase } from "@/server/services/cases";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  return withUser((userId) => getCase(userId, params.id));
}

export async function PATCH(req: Request, { params }: Params) {
  return withUser(async (userId) => {
    const input = await parseBody(req, updateCaseSchema);
    return updateCase(userId, params.id, input);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return withUser(async (userId) => {
    await deleteCase(userId, params.id);
    return { ok: true };
  });
}
