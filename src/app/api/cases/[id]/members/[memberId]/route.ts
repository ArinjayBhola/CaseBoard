import { parseBody, withUser } from "@/server/http";
import { updateMemberSchema } from "@/server/schemas";
import { removeMember, setMemberRole } from "@/server/services/members";

type Params = { params: { id: string; memberId: string } };

export async function PATCH(req: Request, { params }: Params) {
  return withUser(async (userId) => {
    const { role } = await parseBody(req, updateMemberSchema);
    return setMemberRole(userId, params.id, params.memberId, role);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return withUser(async (userId) => {
    await removeMember(userId, params.id, params.memberId);
    return { ok: true };
  });
}
