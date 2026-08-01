import { withUser } from "@/server/http";
import { callStatus } from "@/server/services/calls";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

/** Who is on the call right now, plus the session log. */
export async function GET(_req: Request, { params }: Params) {
  return withUser((userId) => callStatus(userId, params.id));
}
