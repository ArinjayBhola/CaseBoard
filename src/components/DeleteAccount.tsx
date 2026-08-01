"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/icons";

export function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setConfirming(false);
    setConfirmation("");
    setError(null);
  }

  async function deleteAccount() {
    if (confirmation !== "DELETE") return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn’t delete your account.");
      await signOut({ callbackUrl: "/login" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t delete your account.");
      setBusy(false);
    }
  }

  return (
    <section className="surface mt-4 border-clay-500/30 p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-stone-800">Delete account</h2>
      <p className="mt-1 text-sm text-stone-500">
        Permanently delete your account, cases, memberships, sessions, and all related data.
        This cannot be undone.
      </p>

      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="btn-danger mt-5">
          Delete account
        </button>
      ) : (
        <div className="mt-5 rounded-md border border-clay-500/30 bg-clay-500/10 p-4">
          <p className="text-sm font-medium text-clay-600">
            Type <span className="font-semibold">DELETE</span> to confirm permanent deletion.
          </p>
          <input
            autoFocus
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={busy}
            aria-label="Type DELETE to confirm"
            className="field mt-3"
            placeholder="DELETE"
          />
          {error ? <div className="mt-3"><Alert>{error}</Alert></div> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={cancel} disabled={busy} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void deleteAccount()}
              disabled={busy || confirmation !== "DELETE"}
              className="btn-danger"
            >
              {busy ? <><Spinner /> Deleting…</> : "Permanently delete"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
