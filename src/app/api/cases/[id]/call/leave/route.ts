import { withUser } from "@/server/http";
import { leaveCall } from "@/server/services/calls";

type Params = { params: { id: string } };

/**
 * Best-effort departure log. A crashed browser never reaches this, which is why
 * every read reconciles against LiveKit rather than trusting these rows.
 */
export async function POST(_req: Request, { params }: Params) {
  return withUser((userId) => leaveCall(userId, params.id));
}
