import Link from "next/link";
import type { ReactNode } from "react";
import { BoardIcon, ShieldIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/Logo";

export { Alert as FormAlert } from "@/components/ui/Alert";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="min-h-[100dvh] bg-cream-50 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10 sm:px-6 lg:min-h-0">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-8 lg:hidden inline-flex items-center gap-2 rounded-md text-stone-800">
            <Logo size="md" />
          </div>
          
          <h1 className="text-2xl font-bold tracking-tight text-stone-800">{title}</h1>
          <p className="mt-1.5 text-sm text-stone-500">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <p className="mt-8 text-sm text-stone-500">{footer}</p>
        </div>
      </div>

      <aside className="hidden border-l border-cream-300 bg-cream-200 p-12 lg:flex lg:flex-col lg:justify-center overflow-hidden">
        <div className="max-w-md mx-auto animate-slide-up delay-100">
          <div className="mb-10 inline-flex items-center gap-2 rounded-md text-stone-800">
            <Logo size="md" />
          </div>

          <h2 className="text-xl font-bold text-stone-800 tracking-tight leading-snug">
            An investigation workspace, <br/>not a whiteboard app.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-stone-600">
            Map people and the connections between them, mark what is confirmed and what is
            only alleged, and work through it live with people you trust.
          </p>

          <ul className="mt-10 space-y-6">
            <Feature
              icon={<BoardIcon size={20} />}
              title="Connections with confidence"
              body="Every link is labelled confirmed, alleged, or unconfirmed — and looks different on the board."
            />
            <Feature
              icon={<ShieldIcon size={20} />}
              title="Sharing you control"
              body="Screen share shows only your board, never your desktop. During a call you decide who can edit."
            />
          </ul>
        </div>
      </aside>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-4 group">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cream-300 bg-cream-50 text-terracotta-600 shadow-sm transition-transform duration-200 group-hover:scale-105">
        {icon}
      </span>
      <div>
        <p className="text-[15px] font-semibold text-stone-800">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-stone-600">{body}</p>
      </div>
    </li>
  );
}
