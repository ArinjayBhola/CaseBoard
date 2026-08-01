"use client";

import { useEffect, useRef, type ReactNode } from "react";

const widths = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

const FOCUSABLE =
  'input, textarea, select, button:not([tabindex="-1"]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Focusable elements a user can actually reach.
 *
 * Filters out hidden and disabled controls — several dialogs keep an invisible
 * `<input type="file">` earlier in the DOM than their first real field, and both
 * initial focus and the Tab trap would otherwise land on it.
 */
function focusableIn(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if (el instanceof HTMLInputElement && el.type === "hidden") return false;
    // offsetParent is null for anything display:none or inside a hidden subtree.
    return el.offsetParent !== null;
  });
}

/**
 * Dialog.
 *
 * Full-width sheet anchored to the bottom on a phone, centred box from `sm` up —
 * a centred modal on a small screen puts the action buttons under the thumb's
 * reach and the content behind the keyboard.
 *
 * Focus is moved into the dialog on open and returned on close, and Tab is
 * trapped inside, so keyboard users don't wander into the page behind it.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  wide,
  size,
  dismissible = true,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Kept for existing call sites; equivalent to size="md". */
  wide?: boolean;
  size?: keyof typeof widths;
  /**
   * When false, clicking the backdrop or pressing Escape does nothing — the
   * dialog closes only through an explicit control (the ✕ or a footer button).
   * Use for dialogs holding state a stray click shouldn't discard.
   */
  dismissible?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  /**
   * Call sites pass an inline arrow for `onClose`, so its identity changes on
   * every parent render — and the board re-renders constantly from Yjs updates
   * and presence. Reading it through a ref keeps the effect below mounted once,
   * instead of tearing down mid-keystroke and stealing focus back.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;

    // Prefer the first real text field so a dialog opens ready to type, rather
    // than with a button (possibly "Delete") focused.
    const reachable = focusableIn(panel);
    const target =
      reachable.find(
        (el) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement,
      ) ?? reachable[0];
    target?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dismissibleRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      // Recomputed per keypress: buttons enable and disable as the form fills in.
      const items = focusableIn(panel);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);

    // Stop the page behind from scrolling under the dialog.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;

      // Only pull focus back if it is still inside the dialog being closed.
      // Otherwise closing one modal would rip focus away from wherever the user
      // has already moved on to.
      const active = document.activeElement;
      if (!active || active === document.body || panel?.contains(active)) {
        restoreTo.current?.focus?.();
      }
    };
    // Mount/unmount only. Everything the effect needs at runtime is read through
    // a ref, so re-running it on prop changes would only cause focus churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const width = widths[size ?? (wide ? "md" : "sm")];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-stone-800/30 backdrop-blur-[1px]"
        onClick={dismissible ? onClose : undefined}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-xl border border-cream-300 bg-cream-50 shadow-panel sm:max-h-[85vh] sm:rounded-lg ${width}`}
      >
        {/* Grab handle: signals the sheet is dismissible on touch. */}
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-cream-300 sm:hidden" />

        <div className="flex items-start justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-stone-500">{description}</p>
            ) : null}
          </div>
          <button
            className="btn-ghost btn-sm -mr-2 -mt-1 shrink-0 px-2"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="divider" />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <>
            <div className="divider" />
            <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3">
              {footer}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
