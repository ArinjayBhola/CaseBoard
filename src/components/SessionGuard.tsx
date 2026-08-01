"use client";

import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";

/**
 * Watches this browser's own session and signs it out the instant it's revoked
 * elsewhere — another device hitting "Sign out", or a password change on a
 * different device.
 *
 * Mounted once, globally. It only opens the stream while actually signed in, so
 * the login page never connects. The server-side guards already refuse a revoked
 * session's requests; this is what makes the *screen* leave immediately instead
 * of waiting for the user to click something.
 */
export function SessionGuard() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    const source = new EventSource("/api/account/session-status/stream");

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { revoked?: boolean };
        if (data.revoked) {
          source.close();
          void signOut({ callbackUrl: "/login?reason=revoked" });
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    // On error the browser retries on its own; nothing to do. We never sign out
    // on a dropped connection, only on an explicit revoke message.
    return () => source.close();
  }, [status]);

  return null;
}
