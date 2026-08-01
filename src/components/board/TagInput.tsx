"use client";

import { useState } from "react";

export function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    // Accept comma-separated paste as several tags at once.
    const added = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (added.length === 0) return;

    const seen = new Set(tags.map((t) => t.toLowerCase()));
    const next = [...tags];
    for (const t of added) {
      if (seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      next.push(t);
    }
    onChange(next);
    setDraft("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
      return;
    }
    // Backspace on an empty input removes the last chip.
    if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="rounded-md border border-cream-300 bg-cream-50 px-2 py-1.5 focus-within:border-terracotta-500 focus-within:ring-1 focus-within:ring-terracotta-500">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-cream-200 px-2 py-0.5 text-xs text-stone-700"
          >
            {tag}
            <button
              type="button"
              className="text-stone-400 hover:text-clay-600"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              ✕
            </button>
          </span>
        ))}

        <input
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus-visible:ring-0"
          placeholder={tags.length === 0 ? "Add tags, comma separated" : ""}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
        />
      </div>
    </div>
  );
}
