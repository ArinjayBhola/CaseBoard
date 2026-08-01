"use client";

import { arrowPoints, bundleConnectors, connectorGeometry, type Rect } from "./geometry";
import { CONNECTOR_STYLE, type Connector } from "./types";

/**
 * The canvas is unbounded, so the SVG is simply made large enough to cover any
 * realistic board and offset so world (0,0) sits in its middle.
 */
const OFFSET = 50000;
const SIZE = OFFSET * 2;

export function ConnectorLayer({
  connectors,
  rects,
  dimmedIds,
  selectedId,
  draft,
  onSelect,
}: {
  connectors: Connector[];
  rects: Map<string, Rect>;
  /** Connector ids faded out by the current filter. */
  dimmedIds: Set<string> | null;
  selectedId: string | null;
  /** In-progress connector being dragged from a card to the cursor. */
  draft: { from: Rect; x: number; y: number } | null;
  onSelect: (connector: Connector) => void;
}) {
  const bundles = bundleConnectors(connectors);

  return (
    <svg
      className="pointer-events-none absolute"
      style={{ left: -OFFSET, top: -OFFSET, width: SIZE, height: SIZE }}
      viewBox={`${-OFFSET} ${-OFFSET} ${SIZE} ${SIZE}`}
    >
      {connectors.map((connector) => {
        const from = rects.get(connector.fromId);
        const to = rects.get(connector.toId);
        // A card whose size hasn't been measured yet has no rect — skip a frame.
        if (!from || !to) return null;

        const bundle = bundles.get(connector) ?? { index: 0, count: 1 };
        const geo = connectorGeometry(from, to, bundle.index, bundle.count);
        const style = CONNECTOR_STYLE[connector.confidence];
        const dimmed = dimmedIds?.has(connector.id) ?? false;
        const selected = selectedId === connector.id;

        return (
          <g
            key={connector.id}
            opacity={dimmed ? 0.15 : 1}
            style={{ pointerEvents: dimmed ? "none" : "auto", cursor: "pointer" }}
            onPointerDown={(e) => {
              // Don't let the canvas start a pan behind the connector.
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(connector);
            }}
          >
            {/* Invisible fat stroke — the actual click target. */}
            <path d={geo.path} fill="none" stroke="transparent" strokeWidth={18} />

            <path
              d={geo.path}
              fill="none"
              stroke={selected ? "#3B82F6" : style.stroke}
              strokeWidth={selected ? 2.5 : 1.75}
              strokeDasharray={style.dash}
              strokeLinecap="round"
            />

            {connector.direction === "forward" || connector.direction === "both" ? (
              <polygon
                points={arrowPoints(geo.end.x, geo.end.y, geo.endAngle)}
                fill={selected ? "#3B82F6" : style.stroke}
              />
            ) : null}

            {connector.direction === "both" ? (
              <polygon
                points={arrowPoints(geo.start.x, geo.start.y, geo.startAngle)}
                fill={selected ? "#3B82F6" : style.stroke}
              />
            ) : null}

            {connector.label ? (
              <ConnectorLabel
                x={geo.mid.x}
                y={geo.mid.y}
                text={connector.label}
                selected={selected}
              />
            ) : null}
          </g>
        );
      })}

      {draft ? <DraftConnector draft={draft} /> : null}
    </svg>
  );
}

function ConnectorLabel({
  x,
  y,
  text,
  selected,
}: {
  x: number;
  y: number;
  text: string;
  selected: boolean;
}) {
  // SVG can't size a box to its text, so approximate from character count.
  const width = text.length * 6.1 + 14;
  const height = 19;

  return (
    <>
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={4}
        fill="#F8FAFC"
        stroke={selected ? "#3B82F6" : "#E2E8F0"}
        strokeWidth={1}
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fill="#334155"
        style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      >
        {text}
      </text>
    </>
  );
}

/** Line that follows the cursor while dragging from a card's link handle. */
function DraftConnector({ draft }: { draft: { from: Rect; x: number; y: number } }) {
  const cx = draft.from.x + draft.from.width / 2;
  const cy = draft.from.y + draft.from.height / 2;

  return (
    <>
      <line
        x1={cx}
        y1={cy}
        x2={draft.x}
        y2={draft.y}
        stroke="#3B82F6"
        strokeWidth={2}
        strokeDasharray="6 4"
        strokeLinecap="round"
      />
      <circle cx={draft.x} cy={draft.y} r={4} fill="#3B82F6" />
    </>
  );
}
