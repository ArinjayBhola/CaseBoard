import type { ReactNode } from "react";
import { AlertIcon, CheckIcon } from "./icons";

type Tone = "error" | "success" | "info";

const tones: Record<Tone, { wrap: string; icon: string }> = {
  error: {
    wrap: "border-clay-500/30 bg-clay-500/10 text-clay-600",
    icon: "text-clay-600",
  },
  success: {
    wrap: "border-terracotta-500/30 bg-terracotta-500/10 text-terracotta-700",
    icon: "text-terracotta-600",
  },
  info: {
    wrap: "border-cream-300 bg-cream-200 text-stone-700",
    icon: "text-stone-500",
  },
};

/**
 * Inline status message.
 *
 * `role="alert"` on errors so a failure is announced rather than silently
 * appearing above a form the user is still looking down at.
 */
export function Alert({
  tone = "error",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  const style = tones[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${style.wrap} ${className ?? ""}`}
    >
      <span className={`mt-0.5 shrink-0 ${style.icon}`}>
        {tone === "success" ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
