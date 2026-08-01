"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { Group, Person } from "./types";

export type GroupDraft = { label: string; memberIds: string[] };

export function GroupEditor({
  mode,
  initial,
  people,
  /** Ids currently inside the box on canvas — offered as a one-click reset. */
  containedIds,
  onSave,
  onDelete,
  onClose,
}: {
  mode: "create" | "edit";
  initial: GroupDraft;
  people: Person[];
  containedIds: string[];
  onSave: (draft: GroupDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const members = new Set(draft.memberIds);

  function toggle(id: string) {
    setDraft((d) => ({
      ...d,
      memberIds: members.has(id)
        ? d.memberIds.filter((m) => m !== id)
        : [...d.memberIds, id],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.label.trim()) {
      setError("Label is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...draft, label: draft.label.trim() });
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

  const containedDiffers =
    containedIds.length !== draft.memberIds.length ||
    containedIds.some((id) => !members.has(id));

  return (
    <Modal
      wide
      title={mode === "create" ? "New group" : "Edit group"}
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && onDelete ? (
            confirmDelete ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-xs text-stone-600">Delete this group?</span>
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
          <button className="btn-primary" form="group-form" type="submit" disabled={busy}>
            {busy ? "Saving…" : mode === "create" ? "Create group" : "Save"}
          </button>
        </>
      }
    >
      <form id="group-form" onSubmit={submit} className="space-y-4">
        {error ? <p className="text-sm text-clay-600">{error}</p> : null}

        <div>
          <label className="label" htmlFor="group-label">
            Label
          </label>
          <input
            id="group-label"
            className="field"
            autoFocus
            placeholder="e.g. Company X employees"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="label mb-0">Members ({draft.memberIds.length})</span>
            {containedDiffers ? (
              <button
                type="button"
                className="text-xs text-terracotta-600 hover:underline"
                onClick={() => setDraft((d) => ({ ...d, memberIds: containedIds }))}
              >
                Reset to cards inside the box ({containedIds.length})
              </button>
            ) : null}
          </div>

          {people.length === 0 ? (
            <p className="text-sm text-stone-500">No people on this board yet.</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-cream-300 p-2">
              {people.map((person) => (
                <label
                  key={person.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-cream-200"
                >
                  <input
                    type="checkbox"
                    className="accent-terracotta-600"
                    checked={members.has(person.id)}
                    onChange={() => toggle(person.id)}
                  />
                  <span className="flex-1 truncate text-sm text-stone-800">{person.name}</span>
                  {person.role ? (
                    <span className="truncate text-xs text-stone-500">{person.role}</span>
                  ) : null}
                </label>
              ))}
            </div>
          )}

          <p className="mt-1.5 text-xs text-stone-500">
            Members move with the group box. Cards can be added or removed at any time.
          </p>
        </div>
      </form>
    </Modal>
  );
}
