"use client";

import { useEffect } from "react";

/**
 * Catches render and data errors inside the app shell.
 *
 * Deliberately shows no stack trace or error message from the server: this is a
 * tool for handling sensitive material, and internal detail leaking onto the
 * screen is both alarming and occasionally revealing. The digest is enough to
 * find the real error in the logs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[caseboard] unhandled error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="surface w-full max-w-md p-6 text-center shadow-card">
        <h1 className="text-base font-semibold text-stone-800">Something went wrong</h1>
        <p className="mt-2 text-sm text-stone-600">
          The page couldn&rsquo;t load. Your saved work is unaffected — board changes are
          stored as you make them.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button className="btn-primary" onClick={reset}>
            Try again
          </button>
          <a className="btn-secondary" href="/dashboard">
            Back to cases
          </a>
        </div>

        {error.digest ? (
          <p className="mt-4 text-xs text-stone-400">Reference: {error.digest}</p>
        ) : null}
      </div>
    </main>
  );
}
