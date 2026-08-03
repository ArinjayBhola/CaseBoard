import type { Metadata } from "next";
import Link from "next/link";
import { BoardIcon, CheckIcon, ShieldIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/Logo";
import { currentUserId } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Investigation workspace for connected thinking",
  description: "CaseBoard helps teams map people, evidence, and relationships in one private workspace.",
};

export default async function Home() {
  const signedIn = Boolean(await currentUserId());

  return (
    <main id="main" className="min-h-[100dvh] overflow-hidden bg-cream-100">
      <header className="relative z-10 border-b border-cream-300 bg-cream-50/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href={signedIn ? "/dashboard" : "/"} aria-label="CaseBoard home">
            <Logo size="md" />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-5" aria-label="Main navigation">
            <a href="#how-it-works" className="hidden text-sm text-stone-600 transition-colors hover:text-stone-800 sm:inline">
              How it works
            </a>
            <a href="#security" className="hidden text-sm text-stone-600 transition-colors hover:text-stone-800 sm:inline">
              Security
            </a>
            {signedIn ? (
              <Link href="/dashboard" className="btn-primary btn-sm sm:px-3">
                Open workspace <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn-ghost btn-sm sm:px-3">Sign in</Link>
                <Link href="/signup" className="btn-primary btn-sm sm:px-3">Get started <span aria-hidden="true">→</span></Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="relative z-10 max-w-xl animate-slide-up">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-terracotta-500/20 bg-terracotta-500/10 px-3 py-1.5 text-xs font-semibold text-terracotta-700">
            <span className="h-1.5 w-1.5 rounded-full bg-terracotta-500" aria-hidden="true" />
            A clearer way to investigate
          </div>
          <h1 className="max-w-lg text-4xl font-bold leading-[1.08] tracking-tight text-stone-800 sm:text-5xl lg:text-[3.5rem]">
            Make sense of the connections that matter.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-stone-600 sm:text-lg">
            CaseBoard brings people, evidence, and context into one focused workspace—so your team can see the whole picture and move forward with confidence.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={signedIn ? "/dashboard" : "/signup"} className="btn-primary btn-lg group">
              {signedIn ? "Open your workspace" : "Create your workspace"}
              <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
            </Link>
            <Link href="#how-it-works" className="btn-secondary btn-lg">See how it works</Link>
          </div>
          <p className="mt-4 text-xs text-stone-500">Private by default · Built for thoughtful teams</p>
        </div>

        <BoardPreview />
      </section>

      <section id="how-it-works" className="border-y border-cream-300 bg-cream-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-terracotta-600">Everything in one view</p>
            <h2 className="mt-3 text-3xl font-bold text-stone-800 sm:text-4xl">From scattered notes to a shared understanding.</h2>
            <p className="mt-4 text-base leading-relaxed text-stone-600">A calm, structured place to collect what you know, make connections visible, and keep the next step obvious.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <Feature icon={<BoardIcon size={21} />} number="01" title="Map the people" body="Build a living picture of the people, organizations, and relationships inside a case." />
            <Feature icon={<CheckIcon size={21} />} number="02" title="Add the context" body="Keep notes, tags, and confidence levels close to the connection they explain." />
            <Feature icon={<ShieldIcon size={21} />} number="03" title="Work together" body="Invite trusted collaborators and decide exactly who can view or edit your workspace." />
          </div>
        </div>
      </section>

      <section id="security" className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-2xl gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-terracotta-500/20 bg-terracotta-500/10 text-terracotta-600"><ShieldIcon size={22} /></span>
          <div>
            <h2 className="text-xl font-bold text-stone-800">Your work stays yours.</h2>
            <p className="mt-2 leading-relaxed text-stone-600">Cases are private until you invite someone. Sharing is explicit, permissions are visible, and your team stays in control.</p>
          </div>
        </div>
        <Link href={signedIn ? "/dashboard" : "/signup"} className="btn-secondary shrink-0">Start with CaseBoard <span aria-hidden="true">→</span></Link>
      </section>

      <footer className="border-t border-cream-300 bg-cream-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo size="sm" />
          <p>© {new Date().getFullYear()} CaseBoard. A focused space for connected thinking.</p>
        </div>
      </footer>
    </main>
  );
}

function Feature({ icon, number, title, body }: { icon: React.ReactNode; number: string; title: string; body: string }) {
  return (
    <article className="surface-interactive border-t-2 border-t-terracotta-500 p-6">
      <div className="flex items-center justify-between text-terracotta-600">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-terracotta-500/10">{icon}</span>
        <span className="text-xs font-semibold tracking-[0.16em] text-stone-400">{number}</span>
      </div>
      <h3 className="mt-6 text-lg font-semibold text-stone-800">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">{body}</p>
    </article>
  );
}

function BoardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl animate-slide-up delay-100">
      <div className="absolute -inset-5 -z-10 rounded-[2rem] bg-terracotta-500/5" aria-hidden="true" />
      <div className="overflow-hidden rounded-xl border border-cream-300 bg-cream-50 shadow-panel">
        <div className="flex h-12 items-center justify-between border-b border-cream-300 px-4">
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-terracotta-500" /><span className="text-xs font-semibold text-stone-700">Project Northstar</span></div>
          <div className="flex -space-x-1.5"><span className="h-6 w-6 rounded-full border-2 border-cream-50 bg-[#c4b5fd]" /><span className="h-6 w-6 rounded-full border-2 border-cream-50 bg-[#93c5fd]" /><span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-cream-50 bg-cream-200 text-[9px] font-semibold text-stone-500">+2</span></div>
        </div>
        <div className="relative h-[360px] overflow-hidden bg-cream-100 sm:h-[400px]">
          <div className="absolute inset-0 opacity-70" style={{ backgroundImage: "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 560 400" fill="none" aria-hidden="true"><path d="M184 137 356 105M184 137l62 151M356 105 246 288M356 105l96 180M246 288l206-3" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 5" /></svg>
          <Node className="left-[22%] top-[24%]" color="bg-[#bfdbfe]" label="Maya Chen" detail="Lead researcher" />
          <Node className="left-[56%] top-[16%]" color="bg-[#c4b5fd]" label="Northstar Labs" detail="Organization" />
          <Node className="left-[36%] top-[63%]" color="bg-[#bbf7d0]" label="A. Rivera" detail="Confirmed" />
          <Node className="left-[72%] top-[62%]" color="bg-[#fed7aa]" label="Archive 47" detail="Evidence" />
          <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-cream-300 bg-cream-50/95 px-3 py-2 text-[11px] text-stone-600 shadow-card"><span className="h-2 w-2 rounded-full bg-emerald-400" />All changes saved</div>
          <div className="absolute bottom-4 right-4 rounded-lg border border-cream-300 bg-cream-50/95 px-2 py-1 text-[11px] text-stone-500 shadow-card">12 connections</div>
        </div>
      </div>
    </div>
  );
}

function Node({ className, color, label, detail }: { className: string; color: string; label: string; detail: string }) {
  return <div className={`absolute w-32 -translate-x-1/2 rounded-lg border border-cream-300 bg-cream-50 p-2.5 shadow-card sm:w-36 ${className}`}><div className="flex items-center gap-2"><span className={`h-7 w-7 shrink-0 rounded-md ${color}`} /><span className="min-w-0"><span className="block truncate text-[11px] font-semibold text-stone-700">{label}</span><span className="block truncate text-[10px] text-stone-400">{detail}</span></span></div></div>;
}
