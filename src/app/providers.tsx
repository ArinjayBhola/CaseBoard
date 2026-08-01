"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { SessionGuard } from "@/components/SessionGuard";
import { ToastProvider } from "@/components/ui/Toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <SessionGuard />
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}
