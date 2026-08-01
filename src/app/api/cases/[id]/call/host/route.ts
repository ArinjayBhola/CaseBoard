import { withUser } from "@/server/http";
import { claimHost } from "@/server/services/permissions";

type Params = { params: { id: string } };

/**
 * Claims call host. The first person into a call becomes host and keeps it for
 * the duration; later joiners get the existing host back.
 */
export async function POST(_req: Request, { params }: Params) {
  return withUser((userId) => claimHost(userId, params.id));
}
