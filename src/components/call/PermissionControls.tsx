"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Permission } from "@/lib/realtime/entities";

type Participant = {
  userId: string;
  email: string;
  isOwner: boolean;
  permission: Permission;
};

type State = {
  hostUserId: string | null;
  viewerIsHost: boolean;
  participants: Participant[];
};

/**
 * The host's per-person edit toggle.
 *
 * New joiners default to view-only, so this list is how anyone gets edit access
 * during a call. Changes publish over Redis and reach both the websocket server
 * and the affected client immediately.
 */
export function PermissionControls({ caseId }: { caseId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api.get<State>(`/api/cases/${caseId}/permissions`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load permissions");
    }
  }, [caseId]);

  useEffect(() => {
    void load();
    // Someone else's permission can change while this panel is open.
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);

  async function toggle(participant: Participant) {
    const next: Permission = participant.permission === "edit" ? "view" : "edit";
    setPending(participant.userId);
    setError(null);

    // Optimistic, so the switch feels immediate; reconciled by the next load.
    setState((prev) =>
      prev
        ? {
            ...prev,
            participants: prev.participants.map((p) =>
              p.userId === participant.userId ? { ...p, permission: next } : p,
            ),
          }
        : prev,
    );

    try {
      await api.patch(`/api/cases/${caseId}/permissions`, {
        userId: participant.userId,
        permission: next,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change that permission");
      await load();
    } finally {
      setPending(null);
    }
  }

  if (!state) {
    return (
      <div className="border-t border-cream-300 p-3" aria-busy="true">
        <div className="h-3 w-24 animate-pulse rounded bg-cream-300" />
        <div className="mt-2 h-8 animate-pulse rounded bg-cream-200" />
      </div>
    );
  }

  return (
    <section className="border-t border-cream-300 p-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">
        Who can edit
      </h3>

      {error ? <p className="mt-2 text-xs text-clay-600">{error}</p> : null}

      {!state.viewerIsHost ? (
        <p className="mt-2 text-xs text-stone-500">
          The call host controls edit access.
        </p>
      ) : null}

      <ul className="mt-2 space-y-1">
        {state.participants.map((participant) => {
          const locked = participant.isOwner;

          return (
            <li
              key={participant.userId}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-stone-700">
                {participant.email.split("@")[0]}
                {participant.userId === state.hostUserId ? (
                  <span className="ml-1 text-xs text-stone-400">host</span>
                ) : null}
              </span>

              {locked ? (
                // The owner can never be demoted, or a guest who started the
                // call could lock them out of their own case.
                <span className="shrink-0 text-xs text-stone-500" title="Case owner">
                  Can edit
                </span>
              ) : state.viewerIsHost ? (
                <button
                  className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                    participant.permission === "edit"
                      ? "bg-terracotta-600 text-cream-50 hover:bg-terracotta-700"
                      : "border border-cream-300 bg-cream-50 text-stone-600 hover:bg-cream-200"
                  }`}
                  onClick={() => toggle(participant)}
                  disabled={pending === participant.userId}
                >
                  {participant.permission === "edit" ? "Can edit" : "View only"}
                </button>
              ) : (
                <span className="shrink-0 text-xs text-stone-500">
                  {participant.permission === "edit" ? "Can edit" : "View only"}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-xs text-stone-500">
        New joiners start as view-only. Access resets when the call ends.
      </p>
    </section>
  );
}
