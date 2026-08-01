"use client";

import type { ConnectionStatus, Peer } from "@/lib/realtime/useYRoom";

/** Peer pointers, drawn inside the canvas's transformed layer. */
export function PresenceCursors({ peers, scale }: { peers: Peer[]; scale: number }) {
  return (
    <>
      {peers.map((peer) =>
        peer.cursor ? (
          <div
            key={peer.clientId}
            className="pointer-events-none absolute z-40"
            style={{
              left: peer.cursor.x,
              top: peer.cursor.y,
              // Cancel the canvas zoom so cursors stay a constant size on screen.
              transform: `scale(${1 / scale})`,
              transformOrigin: "0 0",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M2 2 L2 14 L5.5 10.8 L8 16 L10.6 14.8 L8.1 9.8 L13 9.4 Z"
                fill={peer.color}
                stroke="#F8FAFC"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="ml-3 inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-cream-50"
              style={{ backgroundColor: peer.color }}
            >
              {peer.name}
            </span>
          </div>
        ) : null,
      )}
    </>
  );
}

export function PresenceBar({
  status,
  peers,
  participantCount,
}: {
  status: ConnectionStatus;
  peers: Peer[];
  participantCount: number;
}) {
  const label =
    status === "connected"
      ? `${participantCount} ${participantCount === 1 ? "person" : "people"} editing`
      : status === "connecting"
        ? "Connecting…"
        : "Offline — edits saved locally";

  const dot =
    status === "connected"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-400"
        : "bg-stone-400";

  return (
    <div className="flex items-center gap-2" title={peers.map((p) => p.name).join(", ")}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span className="whitespace-nowrap text-xs text-stone-500">{label}</span>

      {peers.length > 0 ? (
        <span className="flex -space-x-1.5">
          {peers.slice(0, 4).map((peer) => (
            <span
              key={peer.clientId}
              title={peer.name}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-cream-50 text-[10px] font-semibold text-cream-50"
              style={{ backgroundColor: peer.color }}
            >
              {peer.name.charAt(0).toUpperCase()}
            </span>
          ))}
          {peers.length > 4 ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-cream-50 bg-stone-500 text-[10px] font-semibold text-cream-50">
              +{peers.length - 4}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
