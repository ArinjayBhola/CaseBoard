"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  arrowPoints,
  boundingBox,
  bundleConnectors,
  connectorGeometry,
  type Rect,
} from "@/components/board/geometry";
import { CONNECTOR_STYLE } from "@/components/board/types";
import { CARD_WIDTH } from "@/components/board/PersonCard";
import type { BoardData, Connector, Group, Person } from "@/lib/realtime/entities";

type Payload = { caseTitle: string; board: BoardData; expiresAt: string | null };
type Status = "loading" | "ok" | "expired" | "gone" | "error";

/** How often the viewer re-checks the link, so a revoke/expiry locks it mid-view. */
const POLL_MS = 20_000;
const ESTIMATED_HEIGHT = 96;

/**
 * Public, read-only board. Fetches a share token's snapshot and re-checks it on
 * an interval — when the link is revoked or expires the fetch fails and the
 * board is replaced with a lock screen, so access ends even while watching.
 */
export function SharedBoardView({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const viewerIdRef = useRef<string | null>(null);

  const check = useCallback(async () => {
    if (!viewerIdRef.current) {
      viewerIdRef.current = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    try {
      const res = await fetch(`/api/share/${token}?v=${viewerIdRef.current}`, {
        cache: "no-store",
      });
      if (res.status === 410) return setStatus("expired");
      if (res.status === 404) return setStatus("gone");
      if (!res.ok) return setStatus((s) => (s === "ok" ? "ok" : "error"));
      setData((await res.json()) as Payload);
      setStatus("ok");
    } catch {
      // Network blip — keep whatever we last showed, retry on the next tick.
      setStatus((s) => (s === "ok" ? "ok" : "error"));
    }
  }, [token]);

  useEffect(() => {
    void check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [check]);

  if (status === "expired" || status === "gone") {
    return (
      <LockScreen
        title={status === "expired" ? "This link has expired" : "This link is no longer active"}
        detail="Ask the case owner for a new share link."
      />
    );
  }

  if (status === "error" && !data) {
    return <LockScreen title="Couldn't load this link" detail="Check the link and try again." />;
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        Loading…
      </div>
    );
  }

  return <Canvas title={data.caseTitle} board={data.board} />;
}

function LockScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-semibold text-stone-800">{title}</h1>
      <p className="mt-1.5 max-w-sm text-sm text-stone-500">{detail}</p>
    </div>
  );
}

// ---- Read-only canvas -------------------------------------------------------

function Canvas({ title, board }: { title: string; board: BoardData }) {
  const { people, connectors, groups } = board;

  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const fitted = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMeasure = useCallback((id: string, h: number) => {
    setHeights((prev) => {
      if (prev.get(id) === h) return prev;
      const next = new Map(prev);
      next.set(id, h);
      return next;
    });
  }, []);

  const rects = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const p of people) {
      map.set(p.id, {
        x: p.x,
        y: p.y,
        width: CARD_WIDTH,
        height: heights.get(p.id) ?? ESTIMATED_HEIGHT,
      });
    }
    return map;
  }, [people, heights]);

  // Fit the whole board into view once, after cards have been measured.
  useEffect(() => {
    if (fitted.current || people.length === 0) return;
    if (heights.size < people.length) return;
    const el = containerRef.current;
    if (!el) return;

    const box = boundingBox([...rects.values(), ...groups.map(groupRect)], 60);
    if (!box) return;

    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min(cw / box.width, ch / box.height, 1);
    setView({
      scale,
      x: (cw - box.width * scale) / 2 - box.x * scale,
      y: (ch - box.height * scale) / 2 - box.y * scale,
    });
    fitted.current = true;
  }, [rects, groups, heights.size, people.length]);

  // Drag to pan.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX - view.x, y: e.clientY - view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setView((v) => ({ ...v, x: e.clientX - drag.current!.x, y: e.clientY - drag.current!.y }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // Wheel to zoom at the cursor.
  const onWheel = (e: React.WheelEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const scale = Math.min(2.5, Math.max(0.1, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };

  const bundles = useMemo(() => bundleConnectors(connectors), [connectors]);

  const [downloading, setDownloading] = useState<null | "png" | "pdf">(null);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "board";

  async function renderPng() {
    const node = containerRef.current;
    if (!node) throw new Error("Board not ready");
    const { toPng } = await import("html-to-image");
    return toPng(node, {
      pixelRatio: 2,
      backgroundColor: "#F8FAFC",
      filter: (el) => !(el instanceof HTMLElement && el.dataset.exportIgnore === "true"),
    });
  }

  async function download(kind: "png" | "pdf") {
    setDownloading(kind);
    try {
      const dataUrl = await renderPng();
      if (kind === "png") {
        triggerDownload(dataUrl, `${slug}-board.png`);
      } else {
        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("Could not read image"));
        });
        const { jsPDF } = await import("jspdf");
        const landscape = img.width >= img.height;
        const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const m = 24;
        const s = Math.min((pw - m * 2) / img.width, (ph - m * 2) / img.height);
        const w = img.width * s;
        const h = img.height * s;
        pdf.addImage(dataUrl, "PNG", (pw - w) / 2, (ph - h) / 2, w, h);
        pdf.save(`${slug}-board.pdf`);
      }
    } catch {
      // Swallow — a viewer sees the button return to idle rather than an error toast.
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-cream-300 bg-cream-50 px-4">
        <span className="truncate text-sm font-semibold text-stone-800">{title}</span>
        <span className="chip">View only</span>
        <div className="flex-1" />
        <button
          className="btn-secondary btn-sm"
          onClick={() => download("png")}
          disabled={downloading !== null || people.length === 0}
        >
          {downloading === "png" ? "…" : "PNG"}
        </button>
        <button
          className="btn-secondary btn-sm"
          onClick={() => download("pdf")}
          disabled={downloading !== null || people.length === 0}
        >
          {downloading === "pdf" ? "…" : "PDF"}
        </button>
        <div className="flex items-center gap-1">
          <button className="btn-secondary btn-sm" onClick={() => zoom(setView, 1 / 1.2)}>
            −
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-stone-500">
            {Math.round(view.scale * 100)}%
          </span>
          <button className="btn-secondary btn-sm" onClick={() => zoom(setView, 1.2)}>
            +
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        className="relative flex-1 touch-none overflow-hidden bg-cream-100"
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
      >
        {people.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-stone-500">
            This board is empty.
          </div>
        ) : (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          >
            {groups.map((g) => (
              <GroupBox key={g.id} group={g} />
            ))}

            <svg className="pointer-events-none absolute left-0 top-0 overflow-visible">
              {connectors.map((c) => {
                const from = rects.get(c.fromId);
                const to = rects.get(c.toId);
                if (!from || !to) return null;
                const b = bundles.get(c) ?? { index: 0, count: 1 };
                return (
                  <ConnectorPath key={c.id} connector={c} from={from} to={to} bundle={b} />
                );
              })}
            </svg>

            {people.map((p) => (
              <Card key={p.id} person={p} onMeasure={onMeasure} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function zoom(setView: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>, factor: number) {
  setView((v) => ({ ...v, scale: Math.min(2.5, Math.max(0.1, v.scale * factor)) }));
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

function groupRect(g: Group): Rect {
  return { x: g.x, y: g.y, width: g.width, height: g.height };
}

function GroupBox({ group }: { group: Group }) {
  return (
    <div
      className="absolute rounded-lg border-2"
      style={{
        left: group.x,
        top: group.y,
        width: group.width,
        height: group.height,
        backgroundColor: "#F1F5F9",
        borderColor: "#CBD5E1",
      }}
    >
      {group.label ? (
        <span className="absolute -top-2.5 left-3 rounded bg-cream-50 px-1.5 text-xs font-medium text-stone-500">
          {group.label}
        </span>
      ) : null}
    </div>
  );
}

function ConnectorPath({
  connector,
  from,
  to,
  bundle,
}: {
  connector: Connector;
  from: Rect;
  to: Rect;
  bundle: { index: number; count: number };
}) {
  const g = connectorGeometry(from, to, bundle.index, bundle.count);
  const style = CONNECTOR_STYLE[connector.confidence];
  const showEnd = connector.direction === "forward" || connector.direction === "both";
  const showStart = connector.direction === "both";

  return (
    <g>
      <path
        d={g.path}
        fill="none"
        stroke={style.stroke}
        strokeWidth={2}
        strokeDasharray={style.dash}
        strokeLinecap="round"
      />
      {showEnd ? (
        <polygon points={arrowPoints(g.end.x, g.end.y, g.endAngle)} fill={style.stroke} />
      ) : null}
      {showStart ? (
        <polygon points={arrowPoints(g.start.x, g.start.y, g.startAngle)} fill={style.stroke} />
      ) : null}
      {connector.label ? (
        <>
          <rect
            x={g.mid.x - measureLabel(connector.label) / 2}
            y={g.mid.y - 9.5}
            width={measureLabel(connector.label)}
            height={19}
            rx={4}
            fill="#F8FAFC"
            stroke="#E2E8F0"
          />
          <text
            x={g.mid.x}
            y={g.mid.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fill="#334155"
          >
            {connector.label}
          </text>
        </>
      ) : null}
    </g>
  );
}

function measureLabel(text: string) {
  return Math.max(28, text.length * 6.5 + 14);
}

function Card({
  person,
  onMeasure,
}: {
  person: Person;
  onMeasure: (id: string, height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    onMeasure(person.id, el.offsetHeight);
    const observer = new ResizeObserver(() => onMeasure(person.id, el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [person.id, onMeasure]);

  return (
    <div
      ref={ref}
      style={{ left: person.x, top: person.y, width: CARD_WIDTH }}
      className="absolute select-none rounded-lg border-2 border-cream-300 bg-cream-50 p-3 shadow-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream-200 text-base font-semibold text-terracotta-600">
          {person.name.trim().charAt(0).toUpperCase() || "?"}
        </div>
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
