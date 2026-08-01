import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { SessionsPanel } from "@/components/SessionsPanel";
import { TopBar } from "@/components/TopBar";
import { Avatar } from "@/components/ui/Avatar";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { UsernameEditor } from "@/components/UsernameEditor";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);

  // A remotely-revoked session keeps a valid cookie but loses its user id in the
  // jwt callback — send it to sign in rather than crashing on a null lookup.
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      username: true,
      createdAt: true,
      _count: { select: { cases: true, memberships: true } },
    },
  });

  const name = user?.username || user?.email.split("@")[0] || "Account";

  return (
    <div className="min-h-[100dvh]">
      <TopBar email={session.user.email} username={name} />

      <main id="main" className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded text-sm text-stone-500 transition-colors hover:text-stone-700"
        >
          <ArrowLeftIcon size={16} />
          Back to cases
        </Link>

        {/* Identity header, so the page opens with who you are rather than a form. */}
        <section className="surface mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
          <Avatar name={name} size="xl" />
          <div className="min-w-0">
            <UsernameEditor initialUsername={name} />
            <p className="mt-0.5 truncate text-sm text-stone-500">{user?.email}</p>
            <p className="mt-2 text-xs text-stone-500">
              Member since {user ? formatDate(user.createdAt) : "—"}
            </p>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="Cases you own" value={user?._count.cases ?? 0} />
          <Stat label="Shared with you" value={user?._count.memberships ?? 0} />
        </section>

        <section className="surface mt-4 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-stone-800">Change password</h2>
          <p className="mt-1 text-sm text-stone-500">
            You&rsquo;ll stay signed in here; every other device is signed out.
          </p>
          <div className="mt-5">
            <ChangePasswordForm />
          </div>
        </section>

        <section className="surface mt-4 p-5 sm:p-6">
          <SessionsPanel />
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface px-4 py-3.5">
      <p className="text-2xl font-semibold tabular-nums text-stone-800">{value}</p>
      <p className="mt-0.5 text-xs text-stone-500">{label}</p>
    </div>
  );
}
