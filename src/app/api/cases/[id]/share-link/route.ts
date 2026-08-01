import { json, parseBody, withUser } from "@/server/http";
import { shareLinkSchema } from "@/server/schemas";
import {
  createShareLink,
  getShareLink,
  revokeShareLink,
  type ShareDuration,
} from "@/server/services/shareLinks";

type Params = { params: { id: string } };

/** Owner: current active share link, or null. */
export async function GET(_req: Request, { params }: Params) {
  return withUser(async (userId) => ({ link: await getShareLink(userId, params.id) }));
}

/** Owner: create or regenerate the share link with the chosen lifetime. */
export async function POST(req: Request, { params }: Params) {
  return withUser(async (userId) => {
    const body = await parseBody(req, shareLinkSchema);
    const duration: ShareDuration =
      body.duration === "custom"
        ? { kind: "custom", minutes: body.minutes ?? 0 }
        : { kind: "preset", preset: body.duration };
    return json({ link: await createShareLink(userId, params.id, duration) }, 201);
  });
}

/** Owner: revoke the link immediately. */
export async function DELETE(_req: Request, { params }: Params) {
  return withUser((userId) => revokeShareLink(userId, params.id));
}
