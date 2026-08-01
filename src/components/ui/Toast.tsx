"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertIcon, CheckIcon } from "./icons";

type Tone = "success" | "error" | "info";

type Toast = {
  id: number;
  tone: Tone;
  message: string;
  /** Optional single action, e.g. Undo. */
  action?: { label: string; onClick: () => void };
  duration: number;
};

type ShowInput = {
  tone?: Tone;
  message: string;
  action?: Toast["action"];
  /** Milliseconds before auto-dismiss; errors default longer. */
  duration?: number;
};

type ToastApi = {
  show: (input: ShowInput) => void;
  success: (message: string, opts?: Omit<ShowInput, "message" | "tone">) => void;
  error: (message: string, opts?: Omit<ShowInput, "message" | "tone">) => void;
  info: (message: string, opts?: Omit<ShowInput, "message" | "tone">) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Feedback for actions that would otherwise succeed or fail silently. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((input: ShowInput) => {
    const tone = input.tone ?? "info";
    const toast: Toast = {
      id: nextId++,
      tone,
      message: input.message,
      action: input.action,
      duration: input.duration ?? (tone === "error" ? 6000 : 4000),
    };
    // Cap the stack so a burst never buries the screen.
    setToasts((prev) => [...prev.slice(-3), toast]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, opts) => show({ ...opts, message, tone: "success" }),
      error: (message, opts) => show({ ...opts, message, tone: "error" }),
      info: (message, opts) => show({ ...opts, message, tone: "info" }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const toneStyles: Record<Tone, { wrap: string; icon: string }> = {
  success: { wrap: "border-emerald-500/30", icon: "text-emerald-600" },
  error: { wrap: "border-clay-500/40", icon: "text-clay-600" },
  info: { wrap: "border-cream-300", icon: "text-stone-500" },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const [entered, setEntered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setLeaving(true);
    // Let the exit transition play before removing from the list.
    setTimeout(() => onDismiss(toast.id), 160);
  }, [onDismiss, toast.id]);

  const arm = useCallback(() => {
    timer.current = setTimeout(close, toast.duration);
  }, [close, toast.duration]);

  const disarm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    // Next frame, so the enter transition has a "from" state to animate out of.
    const raf = requestAnimationFrame(() => setEntered(true));
    arm();
    return () => {
      cancelAnimationFrame(raf);
      disarm();
    };
  }, [arm, disarm]);

  const style = toneStyles[toast.tone];

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      // Pause the countdown while the pointer is over it — long enough to read.
      onMouseEnter={disarm}
      onMouseLeave={arm}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-cream-50 px-3.5 py-3 shadow-panel transition-all duration-150 motion-reduce:transition-none ${
        style.wrap
      } ${entered && !leaving ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
    >
      <span className={`mt-0.5 shrink-0 ${style.icon}`}>
        {toast.tone === "success" ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
      </span>
      <p className="min-w-0 flex-1 text-sm text-stone-700">{toast.message}</p>
      {toast.action ? (
        <button
          className="btn-ghost btn-sm -my-1 shrink-0 font-medium text-terracotta-600"
          onClick={() => {
            toast.action?.onClick();
            close();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        className="-my-1 -mr-1 shrink-0 rounded p-1 text-stone-400 transition-colors hover:text-stone-600"
        onClick={close}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
