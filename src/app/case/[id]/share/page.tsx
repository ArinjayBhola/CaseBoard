import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { ShareStage } from "@/components/call/ShareStage";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccess } from "@/server/services/cases";
import type { ShareView } from "@/lib/livekit/shareChannel";

export const dynamic = "force-dynamic";

/**
 * The scoped screen-share surface.
 *
 * Rendered on its own so a tab capture of this page shows the board or
 * whiteboard and nothing else — no other cases, no other tabs' content, no way
 * to navigate away while it is the thing being broadcast.
 */
export default async function SharePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { view?: string };
}) {
  const session = await getServerSession(authOptions);

  const record = await prisma.case.findFirst({
    where: { id: params.id, ...canAccess(session!.user.id) },
    select: { id: true, title: true },
  });
  if (!record) notFound();

  const initialView: ShareView = searchParams.view === "whiteboard" ? "whiteboard" : "board";

  return <ShareStage caseId={record.id} caseTitle={record.title} initialView={initialView} />;
}
