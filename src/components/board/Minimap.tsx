"use client";

import { useMemo } from "react";
import { boundingBox, type Rect } from "./geometry";

const MW = 176;
const MH = 120;
const PAD = 60;

type View = { x: number; y: number; scale: number };

/**
 * Overview of the whole board with the current viewport drawn on top. Click
 * anywhere to recentre there — a fast way around a large graph.
 */
export function Minimap({
  rects,
  view,
  containerRef,
  onRecenter,
}: {
  rects: Map<string, Rect>;
  view: View;
  containerRef: React.RefObject<HTMLElement>;
  onRecenter: (worldX: number, worldY: number) => void;
}) {
  const el = containerRef.current;
  const cw = el?.clientWidth ?? 0;
  const ch = el?.clientHeight ?? 0;

  // The visible viewport, expressed in world coordinates.
  const vp: Rect = {
    x: -view.x / view.scale,
    y: -view.y / view.scale,
    width: cw / view.scale,
    height: ch / view.scale,
  };

  const entries = useMemo(() => [...rects.entries()], [rects]);

  const box = useMemo(
    () => boundingBox([...entries.map(([, r]) => r), vp], PAD),
    [entries, vp.x, vp.y, vp.width, vp.height],
  );

  if (!box || entries.length === 0) return null;

  const scale = Math.min(MW / box.width, MH / box.height);
  const toX = (wx: number) => (wx - box.x) * scale;
  const toY = (wy: number) => (wy - box.y) * scale;

  const onClick = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    onRecenter(box.x + (e.clientX - r.left) / scale, box.y + (e.clientY - r.top) / scale);
  };

  return (
    <div
      data-export-ignore="true"
      onClick={onClick}
      style={{ width: MW, height: MH }}
      className="relative cursor-pointer overflow-hidden rounded-md border border-cream-300 bg-cream-50/95 shadow-card"
      aria-label="Board minimap"
    >
      {entries.map(([id, rc]) => (
        <div
          key={id}
          className="absolute rounded-[1px] bg-stone-400"
          style={{
            left: toX(rc.x),
            top: toY(rc.y),
            width: Math.max(2, rc.width * scale),
            height: Math.max(2, rc.height * scale),
          }}
        />
      ))}
      <div
        className="absolute border border-terracotta-500 bg-terracotta-500/10"
        style={{
          left: toX(vp.x),
          top: toY(vp.y),
          width: vp.width * scale,
          height: vp.height * scale,
        }}
      />
    </div>
  );
}
