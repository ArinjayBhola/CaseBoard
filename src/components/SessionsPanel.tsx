"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Alert } from "@/components/ui/Alert";
import { LaptopIcon, MobileIcon, Spinner } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";

type SessionView = {
  id: string;
  device: string;
  mobile: boolean;
  ip: string | null;
  location: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

/**
 * Where the account is signed in. Lists every recorded session, marks the one
 * you're viewing from, and lets you sign any of them out. Signing out the
 * current session ends this browser's login; signing out another drops that
 * device on its next check-in.
 */
export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const toast = useToast();

  // Live stream: the server pushes a fresh list whenever a session is created or
  // revoked (on any device), so this never needs a manual reload. EventSource
  // reconnects on its own if the connection drops.
  useEffect(() => {
    const source = new EventSource("/api/account/sessions/stream");

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { sessions: SessionView[] };
        setSessions(data.sessions);
        setError(null);
      } catch {
        // Ignore a malformed frame; the next one will be fine.
      }
    };

    source.onerror = () => {
      // The browser retries automatically; only surface a message if we never
      // managed to load anything at all.
      setSessions((prev) => {
        if (prev === null) setError("Reconnecting to live updates…");
        return prev;
      });
    };

    return () => source.close();
  }, []);

  async function signOutOne(s: SessionView) {
    setError(null);
    if (s.current) {
      // Ending our own session: clear the cookie properly, then land on login.
      await signOut({ callbackUrl: "/login" });
      return;
    }
    setBusyId(s.id);
    try {
      await api.del(`/api/account/sessions/${s.id}`);
      setSessions((prev) => (prev ? prev.filter((x) => x.id !== s.id) : prev));
      toast.success(`Signed out ${s.device}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign that session out");
    } finally {
      setBusyId(null);
    }
  }

  async function signOutOthers() {
    setError(null);
    setRevokingOthers(true);
    try {
      const res = await api.del<{ revoked: number }>("/api/account/sessions");
      // The stream will confirm; trim optimistically so it feels instant.
      setSessions((prev) => (prev ? prev.filter((s) => s.current) : prev));
      toast.success(
        res.revoked > 0
          ? `Signed out ${res.revoked} other ${res.revoked === 1 ? "device" : "devices"}`
          : "No other devices to sign out",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign the others out");
    } finally {
      setRevokingOthers(false);
    }
  }

  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Sessions</h2>
          <p className="mt-1 text-sm text-stone-500">
            {sessions
              ? `Signed in on ${sessions.length} ${sessions.length === 1 ? "device" : "devices"}.`
              : "Where your account is signed in."}
          </p>
        </div>
        {others > 0 ? (
          <button
            className="btn-ghost btn-sm shrink-0 text-clay-600 hover:bg-clay-500/10"
            onClick={signOutOthers}
            disabled={revokingOthers}
          >
            {revokingOthers ? <Spinner /> : null}
            Sign out others
          </button>
        ) : null}
      </div>

      {error ? (
        <Alert className="mt-3">{error}</Alert>
      ) : null}

      <ul className="mt-4 space-y-2">
        {!sessions ? (
          [0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-cream-300 p-3">
              <span className="skeleton h-9 w-9 rounded-md" />
              <span className="skeleton h-4 flex-1" />
            </li>
          ))
        ) : sessions.length === 0 ? (
          <li className="rounded-lg border border-dashed border-cream-300 p-4 text-center text-sm text-stone-500">
            No active sessions.
          </li>
        ) : (
          sessions.map((s) => (
            <li
              key={s.id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                s.current ? "border-terracotta-400 bg-terracotta-600/[0.04]" : "border-cream-300"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                  s.current ? "bg-terracotta-600 text-cream-50" : "bg-cream-200 text-stone-600"
                }`}
              >
                {s.mobile ? <MobileIcon size={18} /> : <LaptopIcon size={18} />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate text-sm font-medium text-stone-800">{s.device}</span>
                  {s.current ? (
                    <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      This device
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-stone-500">
                  {s.location ?? "Unknown location"}
                  {s.ip ? <span className="text-stone-400"> · {s.ip}</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-stone-400">
                  {s.current ? "Active now" : `Last active ${formatRelative(s.lastSeenAt)}`}
                </p>
              </div>

              <button
                className="btn-secondary btn-sm shrink-0"
                onClick={() => signOutOne(s)}
                disabled={busyId === s.id}
              >
                {busyId === s.id ? <Spinner /> : null}
                Sign out
              </button>
            </li>
          ))
        )}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-stone-500">
        A signed-out device loses access within a minute. If you think your account is
        compromised, change your password too — that&rsquo;s what an attacker would need to get
        back in.
      </p>
    </div>
  );
}
