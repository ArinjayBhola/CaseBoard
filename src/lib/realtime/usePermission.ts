"use client";

import { useEffect, useState } from "react";
import type { Permission } from "./entities";

export type PermissionState = {
  permission: Permission;
  loading: boolean;
  /** True once we have heard from the server at least once. */
  known: boolean;
};

/**
 * Tracks this user's edit permission for a case.
 *
 * Starts pessimistic: until the server says otherwise the UI renders read-only,
 * so a slow network can never flash editable controls at someone who is not.
 *
 * This is a UI concern only. The websocket server enforces independently — if
 * this hook were bypassed entirely, edits would still be rejected on the socket.
 */
export function usePermission(caseId: string): PermissionState {
  const [permission, setPermission] = useState<Permission>("view");
  const [known, setKnown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      source = new EventSource(`/api/cases/${caseId}/permissions/stream`);

      source.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data) as { permission: Permission };
          setPermission(data.permission === "edit" ? "edit" : "view");
          setKnown(true);
        } catch {
          // Ignore a malformed frame rather than dropping the stream.
        }
      };

      source.onerror = () => {
        source?.close();
        if (cancelled) return;
        // The stream drops on redeploys and sleep/wake. Reconnect rather than
        // silently leaving the UI on a stale permission.
        retry = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [caseId]);

  return { permission, loading: !known, known };
}
