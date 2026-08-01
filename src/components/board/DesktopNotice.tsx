"use client";

import { useState } from "react";

/**
 * The canvas is desktop-primary and says so.
 *
 * Pan, zoom, marquee-select and card dragging on a dense graph via touch is a
 * genuinely different interaction design, not a responsive-CSS problem. Rather
 * than ship something that half-works, this states the limitation and lets the
 * user through anyway — the board is still readable, and everything else in the
 * app (case list, editors, call, history) works on a phone.
 */
export function DesktopNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      data-export-ignore="true"
      className="absolute inset-0 z-40 flex items-center justify-center bg-cream-100/95 p-6 md:hidden"
    >
      <div className="surface max-w-xs p-5 text-center shadow-card">
        <h2 className="text-sm font-semibold text-stone-800">Best on a larger screen</h2>
        <p className="mt-2 text-sm text-stone-600">
          The investigation canvas is built for a mouse and a big window. On a phone you can
          still read the board, but dragging cards and drawing connections will be fiddly.
        </p>
        <button className="btn-primary mt-4 w-full" onClick={() => setDismissed(true)}>
          View it anyway
        </button>
      </div>
    </div>
  );
}
