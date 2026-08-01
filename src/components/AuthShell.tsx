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
    <main className="min-h-[100dvh] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10 sm:px-6 lg:min-h-0">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold text-stone-800">{title}</h1>
          <p className="mt-1.5 text-sm text-stone-500">{subtitle}</p>

          <div className="mt-7">{children}</div>

          <p className="mt-7 text-sm text-stone-500">{footer}</p>
        </div>
      </div>

      <aside className="hidden border-l border-cream-300 bg-cream-200 p-12 lg:flex lg:flex-col lg:justify-center">
        <div className="max-w-sm">
          <div className="mb-10 inline-flex items-center gap-2 rounded-md text-stone-800">
            <Logo size="md" />
          </div>

          <h2 className="text-lg font-semibold text-stone-800">
            An investigation workspace, not a whiteboard app.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Map people and the connections between them, mark what is confirmed and what is
            only alleged, and work through it live with people you trust.
          </p>

          <ul className="mt-8 space-y-4">
            <Feature
              icon={<BoardIcon size={18} />}
              title="Connections with confidence"
              body="Every link is labelled confirmed, alleged, or unconfirmed — and looks different on the board."
            />
            <Feature
              icon={<ShieldIcon size={18} />}
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
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cream-300 bg-cream-50 text-terracotta-600">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-stone-800">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-stone-600">{body}</p>
      </div>
    </li>
  );
}
