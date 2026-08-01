"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { RoomKind } from "@/lib/realtime/token";

type Version = {
  id: string;
  label: string | null;
  createdAt: string;
  createdBy: string | null;
};

type Preview = {
  id: string;
  label: string | null;
  createdAt: string;
  people?: { id: string; name: string; role: string | null }[];
  connectors?: unknown[];
  groups?: { id: string; label: string }[];
  elements?: unknown[];
};

/**
 * Version list, read-only preview, and restore.
 *
 * Preview decodes the stored snapshot server-side and returns plain data — it
 * never touches the live document, so looking at an old version is always safe.
 */
export function VersionHistory({
  caseId,
  kind,
  canRestore,
  onClose,
}: {
  caseId: string;
  kind: RoomKind;
  canRestore: boolean;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      setVersions(await api.get<Version[]>(`/api/cases/${caseId}/versions?kind=${kind}`));
    } catch (err) {
      setVersions([]);
      setError(err instanceof Error ? err.message : "Could not load version history");
    }
  }, [caseId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPreview(id: string) {
    setPreviewing(id);
    setError(null);
    try {
      setPreview(
        await api.get<Preview>(`/api/cases/${caseId}/versions/${id}?kind=${kind}`),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that version");
    } finally {
      setPreviewing(null);
    }
  }

  async function restore(id: string) {
    setRestoring(id);
    setError(null);
    try {
      await api.post(`/api/cases/${caseId}/versions/${id}?kind=${kind}`, {});
      setConfirmId(null);
      setPreview(null);
      // The current state is snapshotted before restoring, so the list changes.
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore that version");
    } finally {
      setRestoring(null);
    }
  }

  async function saveNamed(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/cases/${caseId}/versions?kind=${kind}`, { label: newLabel.trim() });
      setNewLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save a version");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal wide title="Version history" onClose={onClose}>
      {error ? (
        <p className="mb-3 rounded-md border border-clay-500/30 bg-clay-500/10 px-3 py-2 text-sm text-clay-600">
          {error}
        </p>
      ) : null}

      {canRestore ? (
        <form onSubmit={saveNamed} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="field flex-1"
            placeholder="Name this version, e.g. before re-organising"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button type="submit" className="btn-secondary" disabled={saving || !newLabel.trim()}>
            {saving ? "Saving…" : "Save version"}
          </button>
        </form>
      ) : null}

      {versions === null ? (
        <VersionSkeleton />
      ) : versions.length === 0 ? (
        <div className="rounded-md border border-cream-300 px-4 py-8 text-center">
          <p className="text-sm font-medium text-stone-700">No versions yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-stone-500">
            A snapshot is taken automatically every few minutes while someone has this case
            open. You can also save a named version above at any point.
          </p>
        </div>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex flex-wrap items-center gap-2 rounded-md px-2 py-2 hover:bg-cream-100"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-stone-800">
                  {version.label || "Auto-save"}
                </p>
                <p className="text-xs text-stone-500">
                  {formatDate(version.createdAt)}
                  {" · "}
                  {new Date(version.createdAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {version.createdBy ? ` · ${version.createdBy.split("@")[0]}` : ""}
                </p>
              </div>

              <button
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => openPreview(version.id)}
                disabled={previewing === version.id}
              >
                {previewing === version.id ? "Loading…" : "Preview"}
              </button>

              {canRestore ? (
                confirmId === version.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      className="btn-danger px-2 py-1 text-xs"
                      onClick={() => restore(version.id)}
                      disabled={restoring === version.id}
                    >
                      {restoring === version.id ? "Restoring…" : "Confirm"}
                    </button>
                    <button
                      className="btn-ghost px-2 py-1 text-xs"
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn-secondary px-2 py-1 text-xs"
                    onClick={() => setConfirmId(version.id)}
                  >
                    Restore
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {confirmId ? (
        <p className="mt-3 rounded-md bg-cream-200 px-3 py-2 text-xs text-stone-600">
          Restoring replaces the current board for everyone with this case open. The current
          state is saved as &ldquo;Before restore&rdquo; first, so this is reversible.
        </p>
      ) : null}

      {preview ? (
        <PreviewPanel preview={preview} kind={kind} onClose={() => setPreview(null)} />
      ) : null}
    </Modal>
  );
}

function PreviewPanel({
  preview,
  kind,
  onClose,
}: {
  preview: Preview;
  kind: RoomKind;
  onClose: () => void;
}) {
  return (
    <section className="mt-4 rounded-md border border-cream-300 bg-cream-100 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-800">
          Preview — {preview.label || "Auto-save"}
        </h3>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={onClose}>
          Close
        </button>
      </div>

      {kind === "board" ? (
        <>
          <p className="text-xs text-stone-500">
            {preview.people?.length ?? 0} people · {preview.connectors?.length ?? 0} connectors ·{" "}
            {preview.groups?.length ?? 0} groups
          </p>
          {preview.people && preview.people.length > 0 ? (
            <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-sm text-stone-700">
              {preview.people.map((person) => (
                <li key={person.id} className="truncate">
                  {person.name}
                  {person.role ? (
                    <span className="text-stone-500"> — {person.role}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-stone-500">This version has no person cards.</p>
          )}
        </>
      ) : (
        <p className="text-xs text-stone-500">
          {preview.elements?.length ?? 0} whiteboard elements
        </p>
      )}

      <p className="mt-2 text-xs text-stone-500">
        This is a read-only look at the saved state. Nothing on the live board has changed.
      </p>
    </section>
  );
}

function VersionSkeleton() {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Loading version history">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-2 px-2 py-2">
          <div className="flex-1">
            <div className="h-3.5 w-32 animate-pulse rounded bg-cream-300" />
            <div className="mt-1.5 h-3 w-44 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-7 w-16 animate-pulse rounded bg-cream-200" />
        </li>
      ))}
    </ul>
  );
}
