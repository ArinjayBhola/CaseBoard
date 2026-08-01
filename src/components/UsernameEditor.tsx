"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PencilIcon, Spinner, XIcon } from "@/components/ui/icons";

export function UsernameEditor({ initialUsername }: { initialUsername: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [draft, setDraft] = useState(initialUsername);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setDraft(username);
    setError(null);
    setEditing(false);
  }

  async function save() {
    const next = draft.trim();
    if (!next) {
      setError("Enter a username.");
      return;
    }
    if (next.length > 50) {
      setError("Use 50 characters or fewer.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.issues?.username?.[0] ?? body.error ?? "Couldn’t update your username.");
      setUsername(body.username);
      setDraft(body.username);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t update your username.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={draft}
            maxLength={50}
            aria-label="Username"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") cancel();
            }}
            className="field h-9 max-w-full text-lg font-semibold"
          />
          <button type="button" onClick={() => void save()} disabled={busy} aria-label="Save username" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-terracotta-600 hover:bg-terracotta-500/10">
            {busy ? <Spinner size={17} /> : <CheckIcon size={17} />}
          </button>
          <button type="button" onClick={cancel} disabled={busy} aria-label="Cancel username edit" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100">
            <XIcon size={17} />
          </button>
        </div>
        {error ? <p className="mt-1 text-xs text-clay-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <h1 className="truncate text-xl font-semibold text-stone-800">{username}</h1>
      <button type="button" onClick={() => setEditing(true)} aria-label="Edit username" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-cream-200 hover:text-stone-700">
        <PencilIcon size={16} />
      </button>
    </div>
  );
}
