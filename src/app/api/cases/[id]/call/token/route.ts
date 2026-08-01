import { z } from "zod";
import { parseBody, withUser } from "@/server/http";
import { joinCall } from "@/server/services/calls";

type Params = { params: { id: string } };

const bodySchema = z.object({
  /** "share" is the dedicated screen-share connection from the /share tab. */
  kind: z.enum(["member", "share"]).default("member"),
});

/**
 * Mints a LiveKit token after confirming case membership. This is the only
 * place call access is checked — the media server trusts the signed grant,
 * which is scoped to this case's room.
 */
export async function POST(req: Request, { params }: Params) {
  return withUser(async (userId) => {
    const { kind } = await parseBody(req, bodySchema);
    return joinCall(userId, params.id, kind);
  });
}
