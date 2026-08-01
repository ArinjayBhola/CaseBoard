"use client";

import { useEffect, useRef } from "react";
import type { Person } from "./types";

export const CARD_WIDTH = 180;
/** Used for connector routing until a card's real height has been measured. */
export const CARD_ESTIMATED_HEIGHT = 96;

export function PersonCard({
  person,
  dimmed,
  dragging,
  selected,
  linkSource,
  dropTarget,
  onPointerDown,
  onLinkPointerDown,
  onContextMenu,
  onMeasure,
}: {
  person: Person;
  dimmed: boolean;
  dragging: boolean;
  /** Part of the current marquee selection. */
  selected: boolean;
  /** This card started the connector currently being dragged. */
  linkSource: boolean;
  /** The connector drag is hovering here and would land on release. */
  dropTarget: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onLinkPointerDown: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMeasure: (id: string, height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Card height varies with notes and tags, and connectors anchor to the card's
  // edges, so the real height is measured rather than assumed.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const report = () => onMeasure(person.id, el.offsetHeight);
    report();

    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [person.id, onMeasure]);

  const border = dropTarget
    ? "border-terracotta-500"
    : selected
      ? "border-amber-500"
      : dragging || linkSource
        ? "border-terracotta-500"
        : "border-cream-300";

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      style={{ left: person.x, top: person.y, width: CARD_WIDTH }}
      className={[
        "group absolute select-none rounded-lg border-2 bg-cream-50 p-3 shadow-card",
        dragging ? "cursor-grabbing" : "cursor-grab",
        border,
        dropTarget ? "ring-2 ring-terracotta-400" : "",
        // Filtered-out cards fade back but stay in place so the layout never jumps.
        dimmed ? "pointer-events-none opacity-20" : "opacity-100",
      ].join(" ")}
    >
      {/* Connector handle — drag from here onto another card. */}
      <button
        type="button"
        aria-label={`Draw a connection from ${person.name}`}
        onPointerDown={(e) => {
          e.stopPropagation();
          onLinkPointerDown(e);
        }}
        onClick={(e) => e.stopPropagation()}
        className={`absolute -right-2.5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-cream-50 bg-terracotta-500 transition-opacity hover:bg-terracotta-600 ${
          linkSource ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      />

      <div className="flex items-start gap-3">
        {person.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.photoUrl}
            alt=""
            draggable={false}
            className="h-12 w-12 shrink-0 rounded-full border border-cream-300 object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream-200 text-base font-semibold text-terracotta-600">
            {person.name.trim().charAt(0).toUpperCase() || "?"}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-stone-800">
            {person.name}
          </p>
          {person.role ? (
            <p className="mt-0.5 truncate text-xs text-stone-500">{person.role}</p>
          ) : null}
          {person.location ? (
            <p className="mt-0.5 truncate text-xs text-stone-400">{person.location}</p>
          ) : null}
        </div>
      </div>

      {person.notes ? (
        <p className="mt-2.5 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-stone-600">
          {person.notes}
        </p>
      ) : null}

      {person.tags.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {person.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-cream-200 px-1.5 py-0.5 text-[11px] leading-4 text-stone-600"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
