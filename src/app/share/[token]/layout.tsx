import type { Metadata } from "next";

/**
 * Public share view. No nav, no case list, no account chrome — a viewer with the
 * link sees the board and nothing else. Kept out of search indexes.
 */
export const metadata: Metadata = {
  title: "Shared board · CaseBoard",
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-screen bg-cream-100">{children}</div>;
}
