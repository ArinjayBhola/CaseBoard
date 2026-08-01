import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revokeSession } from "@/lib/sessions/service";
import { notFound, unauthorized } from "@/server/errors";
import { json, toErrorResponse } from "@/server/http";

type Params = { params: { id: string } };

/**
 * Revoke a single session. Deleting the row signs that device out — the jwt
 * callback notices the row is gone on its next check and drops the identity.
 * Scoped to the owner, so one user can never end another's session.
 */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw unauthorized();

    const count = await revokeSession(session.user.id, params.id);
    if (count === 0) throw notFound("Session not found");

    return json({ ok: true, current: params.id === session.sessionId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
