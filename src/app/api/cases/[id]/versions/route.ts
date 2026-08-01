import { z } from "zod";
import { json, parseBody, withUser } from "@/server/http";
import { badRequest } from "@/server/errors";
import { createNamedVersion, listVersions } from "@/server/services/versions";
import type { RoomKind } from "@/lib/realtime/token";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

function kindFrom(req: Request): RoomKind {
  const value = new URL(req.url).searchParams.get("kind") ?? "board";
  if (value !== "board" && value !== "whiteboard") {
    throw badRequest("kind must be board or whiteboard");
  }
  return value;
}

export async function GET(req: Request, { params }: Params) {
  return withUser((userId) => listVersions(userId, params.id, kindFrom(req)));
}

const createSchema = z.object({
  label: z.string().trim().min(1, "Give this version a name").max(120),
});

/** Manually named checkpoint, e.g. "Before I re-organised the timeline". */
export async function POST(req: Request, { params }: Params) {
  return withUser(async (userId) => {
    const kind = kindFrom(req);
    const { label } = await parseBody(req, createSchema);
    return json(await createNamedVersion(userId, params.id, kind, label), 201);
  });
}
