"use client";

/**
 * Link between a user's main case tab and their dedicated /share tab.
 *
 * Both are the same origin in the same browser, so a BroadcastChannel is enough.
 * Deliberately not routed through Yjs: which view *you* are sharing is your own
 * business, and putting it in the shared document would broadcast it to everyone
 * on the case whether or not they are on the call.
 */

export type ShareView = "board" | "whiteboard";

export type ShareMessage =
  /** Main tab tells the share tab which view to render. */
  | { type: "set-view"; view: ShareView }
  /** Share tab reports its state so the main tab can show it accurately. */
  | { type: "share-state"; sharing: boolean; view: ShareView }
  /** Main tab asks the share tab to stop and close. */
  | { type: "stop" }
  /** Share tab announces it is listening, so the main tab can resend state. */
  | { type: "hello" };

export function shareChannelName(caseId: string) {
  return `caseboard:share:${caseId}`;
}

/** Returns null where BroadcastChannel is unavailable; callers degrade quietly. */
export function openShareChannel(caseId: string): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(shareChannelName(caseId));
}

export function shareUrl(caseId: string, view: ShareView) {
  return `/case/${caseId}/share?view=${view}`;
}
