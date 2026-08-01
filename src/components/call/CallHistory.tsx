"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";

type Session = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  participants: { userId: string; email: string; joinedAt: string; leftAt: string | null }[];
};

/**
 * Who was on which call, and for how long.
 *
 * This exists so the case owner has their own record of who saw the material —
 * the reason the CallSession tables are worth keeping at all.
 */
export function CallHistory({ caseId }: { caseId: string }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ history: Session[] }>(`/api/cases/${caseId}/call`)
      .then((res) => {
        if (!cancelled) setSessions(res.history);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (!sessions || sessions.length === 0) return null;

  const shown = expanded ? sessions : sessions.slice(0, 3);

  return (
    <section className="mt-6 border-t border-cream-300 pt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">
        Call history
      </h3>

      <ul className="mt-2 space-y-2.5">
        {shown.map((session) => (
          <li key={session.id} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-stone-700">{formatRelative(session.startedAt)}</span>
              <span className="shrink-0 text-stone-500">
                {session.endedAt ? duration(session.startedAt, session.endedAt) : "in progress"}
              </span>
            </div>
            <p className="mt-0.5 text-stone-500">
              {session.participants.map((p) => p.email.split("@")[0]).join(", ") || "nobody"}
            </p>
          </li>
        ))}
      </ul>

      {sessions.length > 3 ? (
        <button
          className="mt-2 text-xs text-terracotta-600 hover:underline"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show fewer" : `Show all ${sessions.length}`}
        </button>
      ) : null}
    </section>
  );
}

function duration(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min`;
}
