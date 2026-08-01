"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatDate, formatRelative } from "@/lib/format";
import { Modal } from "@/components/Modal";
import { Alert } from "@/components/ui/Alert";
import { TextField } from "@/components/ui/Field";
import { BoardIcon, PlusIcon, SearchIcon, Spinner } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";

export type CaseSummary = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  personCount: number;
  thumbnailUrl: string | null;
  isOwner?: boolean;
  memberCount?: number;
};

type SortKey = "recent" | "created" | "title";

type SearchHit = {
  caseId: string;
  caseTitle: string;
  kind: "person" | "connector" | "group";
  label: string;
  detail: string | null;
  personId: string | null;
};

export function CaseList({ initialCases }: { initialCases: CaseSummary[] }) {
  const [cases, setCases] = useState(initialCases);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<CaseSummary | null>(null);
  const [deleting, setDeleting] = useState<CaseSummary | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const toast = useToast();

  // Cross-case content search — people, tags, connection and group labels.
  // Debounced so it fires on a pause, not on every keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => {
          if (!cancelled) setHits(res);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = q
      ? cases.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            (c.description ?? "").toLowerCase().includes(q),
        )
      : cases;

    return [...filtered].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "created") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [cases, query, sort]);

  return (
    <>
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-stone-800">Cases</h1>
            <p className="mt-1 text-sm text-stone-500">
              {cases.length === 0
                ? "No investigations yet"
                : `${cases.length} investigation${cases.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {/* Primary action stays reachable on a phone without hunting. */}
          <button className="btn-primary shrink-0" onClick={() => setCreating(true)}>
            <PlusIcon size={16} />
            New case
          </button>
        </div>

        {cases.length > 0 ? (
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <SearchIcon
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                className="field pl-9"
                placeholder="Search cases, people, tags, connections…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search cases and their contents"
              />
            </div>

            <select
              className="field sm:w-44"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort cases"
            >
              <option value="recent">Recently edited</option>
              <option value="created">Recently created</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
        ) : null}
      </header>

      {hits && hits.length > 0 ? (
        <div className="mb-5 rounded-lg border border-cream-300 bg-cream-50 p-3">
          <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-stone-500">
            Found inside cases
          </p>
          <ul className="space-y-0.5">
            {hits.map((hit) => (
              <li key={`${hit.kind}-${hit.caseId}-${hit.personId ?? hit.label}`}>
                <Link
                  href={
                    hit.personId
                      ? `/case/${hit.caseId}?focus=${hit.personId}`
                      : `/case/${hit.caseId}`
                  }
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-cream-100"
                >
                  <span className="chip shrink-0 capitalize">{hit.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-800">
                    {hit.label}
                    {hit.detail ? <span className="text-stone-500"> · {hit.detail}</span> : null}
                  </span>
                  <span className="shrink-0 truncate text-xs text-stone-500">{hit.caseTitle}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          hasCases={cases.length > 0}
          query={query}
          onCreate={() => setCreating(true)}
          onClear={() => setQuery("")}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <CaseCard
              key={c.id}
              value={c}
              onRename={() => setRenaming(c)}
              onDelete={() => setDeleting(c)}
            />
          ))}
        </ul>
      )}

      {creating ? (
        <CaseFormModal
          title="New case"
          description="You can rename it later."
          submitLabel="Create case"
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            const created = await api.post<{
              id: string;
              title: string;
              description: string | null;
              createdAt: string;
              updatedAt: string;
            }>("/api/cases", values);
            setCases((prev) => [
              { ...created, personCount: 0, thumbnailUrl: null, isOwner: true },
              ...prev,
            ]);
            setCreating(false);
            toast.success(`Created “${created.title}”`);
          }}
        />
      ) : null}

      {renaming ? (
        <CaseFormModal
          title="Rename case"
          submitLabel="Save changes"
          initial={{ title: renaming.title, description: renaming.description ?? "" }}
          onClose={() => setRenaming(null)}
          onSubmit={async (values) => {
            const id = renaming.id;
            const updated = await api.patch<{
              title: string;
              description: string | null;
              updatedAt: string;
            }>(`/api/cases/${id}`, values);
            setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
            setRenaming(null);
            toast.success("Case updated");
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteCaseModal
          target={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(id, title) => {
            setCases((prev) => prev.filter((c) => c.id !== id));
            setDeleting(null);
            toast.success(`Deleted “${title}”`);
          }}
        />
      ) : null}
    </>
  );
}

function CaseCard({
  value,
  onRename,
  onDelete,
}: {
  value: CaseSummary;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="surface-interactive group flex flex-col">
      <Link href={`/case/${value.id}`} className="flex-1 rounded-t-lg p-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-stone-800 group-hover:text-terracotta-700">
            {value.title}
          </h2>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-500">
            {value.description || "No description"}
          </p>
        </div>

        <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
          <div>
            <dt className="inline">Edited </dt>
            <dd className="inline text-stone-600">{formatRelative(value.updatedAt)}</dd>
          </div>
          <div>
            <dt className="inline">Created </dt>
            <dd className="inline text-stone-600">{formatDate(value.createdAt)}</dd>
          </div>
        </dl>
      </Link>

      <div className="flex items-center justify-between gap-2 border-t border-cream-300 px-4 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="chip">
            {value.personCount} {value.personCount === 1 ? "person" : "people"}
          </span>
          {value.isOwner === false ? (
            <span className="chip">Shared with you</span>
          ) : value.memberCount ? (
            <span className="chip">Shared · {value.memberCount}</span>
          ) : null}
        </div>

        {/* Row actions stay visible on touch, where hover doesn't exist. */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button className="btn-ghost btn-sm" onClick={onRename}>
            Rename
          </button>
          {value.isOwner === false ? null : (
            <button
              className="btn-ghost btn-sm hover:bg-clay-500/10 hover:text-clay-600"
              onClick={onDelete}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function EmptyState({
  hasCases,
  query,
  onCreate,
  onClear,
}: {
  hasCases: boolean;
  query: string;
  onCreate: () => void;
  onClear: () => void;
}) {
  const searching = hasCases && query.trim().length > 0;

  return (
    <div className="surface flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-cream-200 text-terracotta-600">
        <BoardIcon size={24} />
      </span>

      <p className="mt-4 text-sm font-medium text-stone-700">
        {searching ? "No cases match that search" : "No cases yet"}
      </p>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-stone-500">
        {searching
          ? "Try a different word, or clear the search to see everything."
          : "A case is one investigation — the people in it, how they connect, and everything you work out along the way."}
      </p>

      <button className="btn-primary mt-5" onClick={searching ? onClear : onCreate}>
        {searching ? "Clear search" : "Create your first case"}
      </button>
    </div>
  );
}

function CaseFormModal({
  title,
  description,
  submitLabel,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  initial?: { title: string; description: string };
  onClose: () => void;
  onSubmit: (values: { title: string; description: string }) => Promise<void>;
}) {
  const [values, setValues] = useState(initial ?? { title: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.title.trim()) {
      setFieldError("Give the case a title.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="case-form" className="btn-primary" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              submitLabel
            )}
          </button>
        </>
      }
    >
      <form id="case-form" onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert>{error}</Alert> : null}

        <TextField
          label="Title"
          autoFocus
          required
          placeholder="e.g. Riverside procurement"
          value={values.title}
          error={fieldError}
          onChange={(e) => {
            setValues((v) => ({ ...v, title: e.target.value }));
            if (fieldError) setFieldError(null);
          }}
        />

        <div>
          <label className="label" htmlFor="case-description">
            Description
          </label>
          <textarea
            id="case-description"
            className="field min-h-[90px] resize-y"
            placeholder="What is this investigation about? Optional."
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          />
        </div>
      </form>
    </Modal>
  );
}

function DeleteCaseModal({
  target,
  onClose,
  onDeleted,
}: {
  target: CaseSummary;
  onClose: () => void;
  onDeleted: (id: string, title: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  // Deleting a case destroys the board, its history, and uploaded photos, so it
  // asks for the title rather than a single confirm click.
  const confirmed = typed.trim() === target.title.trim();

  async function confirm() {
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/cases/${target.id}`);
      onDeleted(target.id, target.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t delete that case.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Delete case"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-danger" onClick={confirm} disabled={busy || !confirmed}>
            {busy ? (
              <>
                <Spinner /> Deleting…
              </>
            ) : (
              "Delete case"
            )}
          </button>
        </>
      }
    >
      {error ? <Alert className="mb-3">{error}</Alert> : null}

      <p className="text-sm leading-relaxed text-stone-700">
        This permanently removes <strong className="font-semibold">{target.title}</strong>,
        its {target.personCount} person card{target.personCount === 1 ? "" : "s"}, every
        connection and group, all saved versions, and any uploaded photos.
      </p>
      <p className="mt-2 text-sm text-stone-500">This cannot be undone.</p>

      <div className="mt-4">
        <TextField
          label={`Type the case title to confirm`}
          placeholder={target.title}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
      </div>
    </Modal>
  );
}
