import { z } from "zod";
import { parseBody, withUser } from "@/server/http";
import {
  participantPermissions,
  permissionState,
  updateParticipantPermission,
} from "@/server/services/permissions";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  userId: z.string().min(1),
  permission: z.enum(["edit", "view"]),
});

/** The caller's own permission plus the full participant list for the host UI. */
export async function GET(_req: Request, { params }: Params) {
  return withUser(async (userId) => {
    const [own, list] = await Promise.all([
      permissionState(userId, params.id),
      participantPermissions(userId, params.id),
    ]);
    return { ...own, ...list };
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return withUser(async (userId) => {
    const { userId: targetUserId, permission } = await parseBody(req, patchSchema);
    return updateParticipantPermission(userId, params.id, targetUserId, permission);
  });
}
