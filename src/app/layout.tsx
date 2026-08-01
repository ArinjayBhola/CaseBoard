import type { Metadata, Viewport } from "next";
import "./globals.css";
import NextTopLoader from 'nextjs-toploader';
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "CaseBoard",
    template: "%s · CaseBoard",
  },
  description: "Investigation workspace for mapping people and how they connect.",
  // A tool for sensitive material has no business in search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available — pinch-to-zoom is an accessibility feature, and the
  // canvas handles its own gestures without needing it disabled globally.
  maximumScale: 5,
  themeColor: "#F8FAFC",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NextTopLoader color="#000" showSpinner={false} />
        <a
          href="#main"
          className="sr-only-focusable btn-primary fixed left-4 top-4 z-[100]"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
