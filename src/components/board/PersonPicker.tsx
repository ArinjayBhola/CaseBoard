"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import type { Person } from "./types";

/** Fallback to the drag-a-handle flow when the target card is offscreen. */
export function PersonPicker({
  fromName,
  people,
  onPick,
  onClose,
}: {
  fromName: string;
  people: Person[];
  onPick: (person: Person) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.role ?? "").toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [people, query]);

  return (
    <Modal title={`Connect ${fromName} to…`} onClose={onClose}>
      <input
        className="field"
        autoFocus
        placeholder="Search people…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {results.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">
          {people.length === 0
            ? "There is nobody else on this board yet."
            : "No people match that search."}
        </p>
      ) : (
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {results.map((person) => (
            <li key={person.id}>
              <button
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-cream-200"
                onClick={() => onPick(person)}
              >
                {person.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={person.photoUrl}
                    alt=""
                    className="h-8 w-8 rounded-full border border-cream-300 object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream-200 text-xs font-semibold text-terracotta-600">
                    {person.name.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-stone-800">{person.name}</span>
                  {person.role ? (
                    <span className="block truncate text-xs text-stone-500">{person.role}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
