"use client";

import type { Group } from "./types";

export function GroupLayer({
  groups,
  dimmedIds,
  activeId,
  onBoxPointerDown,
  onResizePointerDown,
  onOpenEditor,
}: {
  groups: Group[];
  dimmedIds: Set<string> | null;
  activeId: string | null;
  onBoxPointerDown: (e: React.PointerEvent, group: Group) => void;
  onResizePointerDown: (e: React.PointerEvent, group: Group) => void;
  onOpenEditor: (group: Group) => void;
}) {
  return (
    <>
      {groups.map((group) => {
        const dimmed = dimmedIds?.has(group.id) ?? false;
        const active = activeId === group.id;

        return (
          <div
            key={group.id}
            onPointerDown={(e) => onBoxPointerDown(e, group)}
            style={{
              left: group.x,
              top: group.y,
              width: group.width,
              height: group.height,
              // Low-saturation fill: reads as a region without competing with
              // the cards sitting on top of it.
              backgroundColor: "#F1F5F9",
              borderColor: active ? "#3B82F6" : "#CBD5E1",
              opacity: dimmed ? 0.25 : 1,
              pointerEvents: dimmed ? "none" : "auto",
            }}
            className="absolute cursor-move rounded-lg border-2"
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenEditor(group);
              }}
              className="absolute -top-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded border border-cream-300 bg-cream-50 px-2 py-0.5 text-xs font-medium text-stone-700 hover:border-terracotta-500 hover:text-terracotta-600"
            >
              {group.label}
              <span className="ml-1.5 text-stone-400">{group.memberIds.length}</span>
            </button>

            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizePointerDown(e, group);
              }}
              className="absolute -bottom-1 -right-1 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-cream-50 bg-stone-400 hover:bg-terracotta-500"
              aria-label={`Resize ${group.label}`}
            />
          </div>
        );
      })}
    </>
  );
}
