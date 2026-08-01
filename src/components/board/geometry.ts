export type Rect = { x: number; y: number; width: number; height: number };

/** Perpendicular spacing (world px) between parallel connectors joining the same pair. */
const SPREAD = 26;

export function rectCenter(r: Rect) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function rectContains(outer: Rect, inner: Rect) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function rectsIntersect(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Normalises a drag (which can run in any direction) into a positive-size rect. */
export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

/** Bounding box of several rects, expanded by `pad` on every side. */
export function boundingBox(rects: Rect[], pad = 0): Rect | null {
  if (rects.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }

  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/**
 * Where a ray from the rect's centre toward (tx, ty) crosses the rect border.
 * Keeps connector ends touching the card edge instead of vanishing under it.
 */
function edgePoint(rect: Rect, tx: number, ty: number) {
  const c = rectCenter(rect);
  const dx = tx - c.x;
  const dy = ty - c.y;

  if (dx === 0 && dy === 0) return c;

  const hw = rect.width / 2;
  const hh = rect.height / 2;

  // Scale the direction vector until it hits whichever edge comes first.
  const scaleX = dx === 0 ? Infinity : hw / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(scaleX, scaleY);

  return { x: c.x + dx * t, y: c.y + dy * t };
}

export type ConnectorGeometry = {
  path: string;
  /** Label anchor — the curve's midpoint. */
  mid: { x: number; y: number };
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** Radians, pointing outward at each end, for drawing arrowheads. */
  startAngle: number;
  endAngle: number;
};

/**
 * Quadratic curve between two cards.
 *
 * `index` / `count` fan multiple connectors joining the same pair out sideways,
 * so "business partner" and "family" stay separately visible and clickable
 * instead of overlapping into one line.
 */
export function connectorGeometry(
  from: Rect,
  to: Rect,
  index = 0,
  count = 1,
): ConnectorGeometry {
  const a = rectCenter(from);
  const b = rectCenter(to);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;

  // Unit normal to the A→B line, used to push parallel connectors apart.
  const nx = -dy / len;
  const ny = dx / len;

  const spread = (index - (count - 1) / 2) * SPREAD;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  // Control sits at twice the offset so the curve's apex lands on `spread`.
  const cx = midX + nx * spread * 2;
  const cy = midY + ny * spread * 2;

  const start = edgePoint(from, cx, cy);
  const end = edgePoint(to, cx, cy);

  // Quadratic Bézier at t = 0.5.
  const mid = {
    x: 0.25 * start.x + 0.5 * cx + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * cy + 0.25 * end.y,
  };

  return {
    path: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`,
    mid,
    start,
    end,
    // Tangents at the endpoints of a quadratic point away from the control.
    startAngle: Math.atan2(start.y - cy, start.x - cx),
    endAngle: Math.atan2(end.y - cy, end.x - cx),
  };
}

/** Triangle polygon points for an arrowhead sitting at (x, y) facing `angle`. */
export function arrowPoints(x: number, y: number, angle: number, size = 11) {
  const spread = 0.42; // radians either side of the shaft
  const p1 = `${x},${y}`;
  const p2 = `${x - size * Math.cos(angle - spread)},${y - size * Math.sin(angle - spread)}`;
  const p3 = `${x - size * Math.cos(angle + spread)},${y - size * Math.sin(angle + spread)}`;
  return `${p1} ${p2} ${p3}`;
}

/** Groups connectors so each parallel bundle knows its index and size. */
export function bundleConnectors<T extends { fromId: string; toId: string }>(connectors: T[]) {
  const buckets = new Map<string, T[]>();

  for (const c of connectors) {
    // Same key regardless of direction — A→B and B→A share one bundle.
    const key = [c.fromId, c.toId].sort().join("::");
    const list = buckets.get(key);
    if (list) list.push(c);
    else buckets.set(key, [c]);
  }

  const result = new Map<T, { index: number; count: number }>();
  for (const list of buckets.values()) {
    list.forEach((c, i) => result.set(c, { index: i, count: list.length }));
  }
  return result;
}
