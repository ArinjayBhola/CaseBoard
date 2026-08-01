import { withUser } from "@/server/http";
import { badRequest } from "@/server/errors";
import { previewVersion, restoreVersion } from "@/server/services/versions";
import type { RoomKind } from "@/lib/realtime/token";

type Params = { params: { id: string; versionId: string } };

export const dynamic = "force-dynamic";

function kindFrom(req: Request): RoomKind {
  const value = new URL(req.url).searchParams.get("kind") ?? "board";
  if (value !== "board" && value !== "whiteboard") {
    throw badRequest("kind must be board or whiteboard");
  }
  return value;
}

/** Read-only preview. Does not touch the live document. */
export async function GET(req: Request, { params }: Params) {
  return withUser((userId) =>
    previewVersion(userId, params.id, kindFrom(req), params.versionId),
  );
}

/** Restore. Broadcasts to everyone connected if the room is live. */
export async function POST(req: Request, { params }: Params) {
  return withUser((userId) =>
    restoreVersion(userId, params.id, kindFrom(req), params.versionId),
  );
}
