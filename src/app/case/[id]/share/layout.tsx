import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CaseBoard — shared view",
  // This tab is meant to be captured and shown to other people. Keep it out of
  // search engines and out of any link preview.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Deliberately bare layout.
 *
 * The whole point of this route is that capturing it exposes the board and
 * nothing else — no nav, no case list, no account menu, no links off the page.
 * Anything added here becomes visible to everyone the user shares with, so treat
 * additions as a source-protection decision, not a styling one.
 */
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-screen w-screen overflow-hidden bg-cream-100">{children}</div>;
}
