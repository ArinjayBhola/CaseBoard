"use client";

/**
 * Last-resort boundary: catches failures in the root layout itself, where the
 * normal error page cannot render. Ships its own <html>/<body> and no styling
 * dependencies, since the stylesheet may be exactly what failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          background: "#F8FAFC",
          color: "#1E293B",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>CaseBoard is down</h1>
          <p style={{ fontSize: "0.875rem", color: "#475569", marginTop: "0.5rem" }}>
            The application failed to start. Nothing you saved has been lost.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              background: "#2563EB",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0.5rem 0.75rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "1rem" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
