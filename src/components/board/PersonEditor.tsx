"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Alert } from "@/components/ui/Alert";
import { TextField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/icons";
import { api } from "@/lib/api";
import { TagInput } from "./TagInput";
import type { PersonDraft } from "./types";

export function PersonEditor({
  mode,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  mode: "create" | "edit";
  initial: PersonDraft;
  onSave: (draft: PersonDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const { url } = await api.upload<{ key: string; url: string }>("/api/upload", file);
      set("photoUrl", url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setNameError("A name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...draft, name: draft.name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <Modal
      size="md"
      title={mode === "create" ? "Add person" : "Edit person"}
      description={
        mode === "create"
          ? "Only a name is required — fill in the rest as you learn it."
          : undefined
      }
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && onDelete ? (
            confirmDelete ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-xs text-stone-600">Delete this card?</span>
                <button className="btn-danger px-2 py-1 text-xs" onClick={remove} disabled={busy}>
                  Yes, delete
                </button>
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn-ghost mr-auto text-clay-600 hover:bg-clay-500/10"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )
          ) : null}

          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="person-form" type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Saving…
              </>
            ) : mode === "create" ? (
              "Add person"
            ) : (
              "Save"
            )}
          </button>
        </>
      }
    >
      <form id="person-form" onSubmit={submit} className="space-y-5">
        {error ? <Alert>{error}</Alert> : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {draft.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.photoUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full border border-cream-300 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-cream-200 text-lg font-semibold text-terracotta-600">
              {draft.name.trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading…" : draft.photoUrl ? "Replace photo" : "Upload photo"}
              </button>
              {draft.photoUrl ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => set("photoUrl", null)}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="text-xs text-stone-500">JPEG, PNG, WebP or GIF. Max 5 MB.</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={onPickPhoto}
            />
          </div>
        </div>

        <TextField
          label="Name"
          autoFocus
          required
          placeholder="Full name"
          value={draft.name}
          error={nameError}
          onChange={(e) => {
            set("name", e.target.value);
            if (nameError) setNameError(null);
          }}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="Role"
            placeholder="e.g. Director"
            value={draft.role}
            onChange={(e) => set("role", e.target.value)}
          />
          <TextField
            label="Location"
            placeholder="e.g. Lisbon"
            value={draft.location}
            onChange={(e) => set("location", e.target.value)}
          />
          <TextField
            label="Source"
            placeholder="Where this came from"
            value={draft.source}
            onChange={(e) => set("source", e.target.value)}
          />
        </div>

        <div>
          <span className="label">Tags</span>
          <TagInput tags={draft.tags} onChange={(tags) => set("tags", tags)} />
        </div>

        <div>
          <label className="label" htmlFor="person-notes">
            Notes
          </label>
          <textarea
            id="person-notes"
            className="field min-h-[120px] resize-y"
            placeholder="What you know, what you still need to check…"
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
