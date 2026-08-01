import { json, parseBody, withUser } from "@/server/http";
import { inviteMemberSchema } from "@/server/schemas";
import { addMember, listMembers } from "@/server/services/members";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  return withUser((userId) => listMembers(userId, params.id));
}

export async function POST(req: Request, { params }: Params) {
  return withUser(async (userId) => {
    const { email, role } = await parseBody(req, inviteMemberSchema);
    return json(await addMember(userId, params.id, email, role), 201);
  });
}
