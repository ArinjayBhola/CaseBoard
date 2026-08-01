"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import {
  CONFIDENCE_OPTIONS,
  CONNECTOR_STYLE,
  DIRECTION_OPTIONS,
  type Confidence,
  type Direction,
} from "./types";

export type ConnectorDraft = {
  label: string;
  confidence: Confidence;
  direction: Direction;
};

export function ConnectorEditor({
  mode,
  fromName,
  toName,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  mode: "create" | "edit";
  fromName: string;
  toName: string;
  initial: ConnectorDraft;
  onSave: (draft: ConnectorDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <Modal
      title={mode === "create" ? "New connection" : "Edit connection"}
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && onDelete ? (
            confirmDelete ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-xs text-stone-600">Delete this connection?</span>
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
          <button className="btn-primary" form="connector-form" type="submit" disabled={busy}>
            {busy ? "Saving…" : mode === "create" ? "Add connection" : "Save"}
          </button>
        </>
      }
    >
      <form id="connector-form" onSubmit={submit} className="space-y-4">
        {error ? <p className="text-sm text-clay-600">{error}</p> : null}

        <p className="rounded-md bg-cream-200 px-3 py-2 text-sm text-stone-700">
          <span className="font-medium">{fromName}</span>
          <span className="mx-2 text-stone-400">
            {draft.direction === "forward" ? "→" : draft.direction === "both" ? "↔" : "—"}
          </span>
          <span className="font-medium">{toName}</span>
        </p>

        <div>
          <label className="label" htmlFor="connector-label">
            Label <span className="normal-case text-stone-400">(optional)</span>
          </label>
          <input
            id="connector-label"
            className="field"
            autoFocus
            placeholder="e.g. business partner, met at event X"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          />
        </div>

        <div>
          <span className="label">Confidence</span>
          <div className="space-y-1.5">
            {CONFIDENCE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                  draft.confidence === option.value
                    ? "border-terracotta-500 bg-cream-200"
                    : "border-cream-300 bg-cream-50 hover:bg-cream-100"
                }`}
              >
                <input
                  type="radio"
                  name="confidence"
                  className="sr-only"
                  checked={draft.confidence === option.value}
                  onChange={() => setDraft((d) => ({ ...d, confidence: option.value }))}
                />
                <span className="flex-1 text-sm text-stone-800">{option.label}</span>
                <span className="text-xs text-stone-500">{option.hint}</span>
                <svg width="48" height="8" aria-hidden="true">
                  <line
                    x1="2"
                    y1="4"
                    x2="46"
                    y2="4"
                    stroke={CONNECTOR_STYLE[option.value].stroke}
                    strokeWidth="2"
                    strokeDasharray={CONNECTOR_STYLE[option.value].dash}
                    strokeLinecap="round"
                  />
                </svg>
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Direction</span>
          <div className="flex gap-2">
            {DIRECTION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.hint}
                onClick={() => setDraft((d) => ({ ...d, direction: option.value }))}
                className={`flex-1 rounded-md border px-2 py-2 text-xs ${
                  draft.direction === option.value
                    ? "border-terracotta-500 bg-cream-200 text-stone-800"
                    : "border-cream-300 bg-cream-50 text-stone-600 hover:bg-cream-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-stone-500">
            Leave as no direction unless it means something, e.g. &ldquo;reports to&rdquo;.
          </p>
        </div>
      </form>
    </Modal>
  );
}
