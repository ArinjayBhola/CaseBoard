import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CaseList } from "@/components/CaseList";
import { TopBar } from "@/components/TopBar";
import { listCases } from "@/server/services/cases";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const cases = await listCases(userId);

  // Dates cross the server/client boundary as strings.
  const initial = cases.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <div className="min-h-[100dvh]">
      <TopBar email={session!.user.email} username={session!.user.name} imageUrl={session!.user.image} />
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <CaseList initialCases={initial} />
      </main>
    </div>
  );
}
