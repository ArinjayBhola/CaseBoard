import { parseBody, withUser } from "@/server/http";
import { importRequestSchema } from "@/server/schemas";
import { boardStats, importBoard } from "@/server/services/boardIo";

type Params = { params: { id: string } };

/** Current entity counts — the client uses these to warn before overwriting. */
export async function GET(_req: Request, { params }: Params) {
  return withUser((userId) => boardStats(userId, params.id));
}

export async function POST(req: Request, { params }: Params) {
  return withUser(async (userId) => {
    const input = await parseBody(req, importRequestSchema);
    return importBoard(userId, params.id, input);
  });
}
