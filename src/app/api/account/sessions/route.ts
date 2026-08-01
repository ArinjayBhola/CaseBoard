import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listSessions, revokeOtherSessions } from "@/lib/sessions/service";
import { unauthorized } from "@/server/errors";
import { json, toErrorResponse } from "@/server/http";

/** The signed-in user's sessions, newest activity first. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw unauthorized();
    const sessions = await listSessions(session.user.id, session.sessionId ?? null);
    return json({ sessions });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Sign out of every other session (keeps the current one). */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw unauthorized();
    const revoked = await revokeOtherSessions(session.user.id, session.sessionId ?? null);
    return json({ revoked });
  } catch (err) {
    return toErrorResponse(err);
  }
}
