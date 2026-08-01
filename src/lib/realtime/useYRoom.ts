"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { roomName, type RoomKind } from "./token";

export type ConnectionStatus = "connecting" | "connected" | "offline";

export type Peer = {
  clientId: number;
  name: string;
  color: string;
  /** Board/scene coordinates of this peer's pointer, if they have one. */
  cursor: { x: number; y: number } | null;
};

export type Room = {
  doc: Y.Doc;
  provider: WebsocketProvider | null;
  status: ConnectionStatus;
  peers: Peer[];
  /** Includes you. */
  participantCount: number;
  /** Whether the local IndexedDB cache has finished loading. */
  ready: boolean;
  setCursor: (point: { x: number; y: number } | null) => void;
};

/**
 * Joins a Yjs room over the self-hosted websocket server.
 *
 * Three layers stack here:
 *  - y-indexeddb caches the doc locally, so a refresh or a brief disconnect
 *    keeps in-progress edits and the board paints before the network answers.
 *  - y-websocket syncs with everyone else in the room.
 *  - The server persists to Postgres on its own schedule.
 */
export function useYRoom(caseId: string, kind: RoomKind): Room {
  // One doc per case+kind for the lifetime of the component.
  const doc = useMemo(() => new Y.Doc(), []);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [ready, setReady] = useState(false);
  const providerRef = useRef<WebsocketProvider | null>(null);

  const room = roomName(kind, caseId);

  useEffect(() => {
    let cancelled = false;
    let ws: WebsocketProvider | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    // Local cache first — this resolves without the network.
    const idb = new IndexeddbPersistence(`caseboard:${room}`, doc);
    idb.whenSynced.then(() => {
      if (!cancelled) setReady(true);
    });

    // Trade the session cookie for a short-lived signed token. The websocket
    // server runs on another origin and cannot read the cookie itself.
    async function fetchToken(): Promise<{ token: string; wsUrl: string }> {
      const res = await fetch("/api/realtime/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      if (!res.ok) throw new Error("Could not authorise realtime session");
      return (await res.json()) as { token: string; wsUrl: string };
    }

    async function connect() {
      const { token, wsUrl } = await fetchToken();
      if (cancelled) return;

      ws = new WebsocketProvider(wsUrl, room, doc, {
        params: { token },
      });
      providerRef.current = ws;
      setProvider(ws);

      // The token expires in 10 minutes but a session runs for hours. y-websocket
      // re-reads `provider.params` on every reconnect, so keep a fresh token there
      // — otherwise the first reconnect after expiry fails auth and the client is
      // stuck offline until a page reload. Refresh well inside the TTL.
      refreshTimer = setInterval(() => {
        fetchToken()
          .then(({ token: fresh }) => {
            if (!cancelled && ws) ws.params = { token: fresh };
          })
          .catch(() => {
            // Transient failure — the existing token may still be valid, and the
            // next tick retries.
          });
      }, 8 * 60_000);

      ws.on("status", (event: { status: string }) => {
        if (cancelled) return;
        setStatus(event.status === "connected" ? "connected" : "connecting");
      });

      ws.on("connection-close", () => {
        if (!cancelled) setStatus("offline");
      });

      const awareness = ws.awareness;

      const readPeers = () => {
        if (cancelled) return;
        const next: Peer[] = [];
        awareness.getStates().forEach((state, clientId) => {
          if (clientId === awareness.clientID) return;
          const user = (state as { user?: { name?: string; color?: string } }).user;
          const cursor = (state as { cursor?: { x: number; y: number } | null }).cursor;
          next.push({
            clientId,
            name: user?.name ?? "Someone",
            color: user?.color ?? "#8C8177",
            cursor: cursor ?? null,
          });
        });
        setPeers(next);
      };

      awareness.on("change", readPeers);
      readPeers();
    }

    connect().catch((err) => {
      console.error("[realtime] connect failed:", err);
      if (!cancelled) setStatus("offline");
    });

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      ws?.awareness.setLocalState(null);
      ws?.destroy();
      providerRef.current = null;
      void idb.destroy();
    };
  }, [caseId, doc, room]);

  /** Identity is attached once the provider exists; peers read it from awareness. */
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;

    fetch("/api/realtime/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { name: string; color: string } | null) => {
        if (cancelled || !me) return;
        provider.awareness.setLocalStateField("user", { name: me.name, color: me.color });
      })
      .catch(() => {
        // Presence label is cosmetic — sync still works without it.
      });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  const setCursor = useMemo(
    () => (point: { x: number; y: number } | null) => {
      providerRef.current?.awareness.setLocalStateField("cursor", point);
    },
    [],
  );

  useEffect(() => {
    return () => doc.destroy();
  }, [doc]);

  return {
    doc,
    provider,
    status,
    peers,
    participantCount: peers.length + 1,
    ready,
    setCursor,
  };
}
