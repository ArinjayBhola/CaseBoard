import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { CaseWorkspace } from "@/components/CaseWorkspace";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccess } from "@/server/services/cases";

export const dynamic = "force-dynamic";

/**
 * Board and whiteboard content now arrives over the websocket from the Yjs
 * document, so this page only needs to authorise the case and name it.
 */
export default async function CasePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  const record = await prisma.case.findFirst({
    where: { id: params.id, ...canAccess(session!.user.id) },
    select: { id: true, title: true },
  });
  if (!record) notFound();

  return <CaseWorkspace caseId={record.id} caseTitle={record.title} />;
}
