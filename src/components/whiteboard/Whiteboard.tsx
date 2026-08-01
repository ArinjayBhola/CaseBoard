"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { whiteboardMap } from "@/lib/realtime/boardDoc";
import { useYRoom } from "@/lib/realtime/useYRoom";
import { PresenceBar } from "@/components/board/Presence";
import { LOCAL_ORIGIN, WhiteboardSync } from "./sync";

type AppStateLike = ReturnType<ExcalidrawImperativeAPI["getAppState"]>;

// Excalidraw touches window at module scope, so it can only load in the browser.
const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        Loading whiteboard…
      </div>
    ),
  },
);

/** Quiet period before publishing local edits. */
const PUSH_DEBOUNCE_MS = 120;
/** Ceiling so a continuous stroke still publishes while it's being drawn. */
const PUSH_MAX_WAIT_MS = 300;

/**
 * The bits of the Excalidraw module we need at runtime. Loaded lazily with the
 * component — importing them at module scope would drag the library into SSR.
 */
type ExcalidrawLib = {
  reconcileElements: (
    local: readonly OrderedExcalidrawElement[],
    remote: readonly OrderedExcalidrawElement[],
    appState: AppStateLike,
  ) => OrderedExcalidrawElement[];
  hashElementsVersion: (elements: readonly OrderedExcalidrawElement[]) => number;
  CaptureUpdateAction: { NEVER: string };
};

/**
 * Whiteboard.
 *
 * This component is glue: the Excalidraw instance, the Yjs room, and presence.
 * The merge bookkeeping lives in `WhiteboardSync` (see sync.ts), which is where
 * the interesting behaviour — and the tests — sit.
 *
 * Merging itself is delegated to Excalidraw's own `reconcileElements`, the same
 * function its first-party collaboration uses. It takes local app state, so an
 * element the user is currently dragging or editing is never yanked out from
 * under them by an incoming update.
 *
 * Only elements are shared. App state (viewport, selection, active tool) stays
 * local on purpose — syncing it would drag every collaborator's screen around.
 */
export function Whiteboard({
  caseId,
  presentation = false,
}: {
  caseId: string;
  /** Strips the header for the scoped screen-share route. */
  presentation?: boolean;
}) {
  const room = useYRoom(caseId, "whiteboard");
  const { doc, status, peers, participantCount, ready, setCursor } = room;

  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [lib, setLib] = useState<ExcalidrawLib | null>(null);

  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushAt = useRef(0);

  const elements = useMemo(() => whiteboardMap(doc), [doc]);

  // Built once the Excalidraw module has loaded, since it supplies the merge
  // and hash functions.
  const sync = useMemo(() => {
    if (!lib) return null;
    return new WhiteboardSync<OrderedExcalidrawElement, AppStateLike>(
      doc,
      elements,
      lib.reconcileElements,
      lib.hashElementsVersion,
    );
  }, [doc, elements, lib]);

  useEffect(() => {
    let cancelled = false;
    void import("@excalidraw/excalidraw").then((mod) => {
      if (cancelled) return;
      setLib({
        reconcileElements: mod.reconcileElements as unknown as ExcalidrawLib["reconcileElements"],
        hashElementsVersion:
          mod.hashElementsVersion as unknown as ExcalidrawLib["hashElementsVersion"],
        CaptureUpdateAction: mod.CaptureUpdateAction as unknown as ExcalidrawLib["CaptureUpdateAction"],
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Yjs → Excalidraw. */
  const pull = useCallback(() => {
    if (!api || !lib || !sync) return;

    const reconciled = sync.pull(api.getSceneElementsIncludingDeleted(), api.getAppState());
    if (!reconciled) return;

    api.updateScene({
      elements: reconciled,
      // Remote edits must not enter this user's undo stack.
      captureUpdate: lib.CaptureUpdateAction.NEVER as never,
    });
  }, [api, lib, sync]);

  /** Excalidraw → Yjs. */
  const push = useCallback(() => {
    if (!api || !sync) return;
    lastPushAt.current = Date.now();
    // Tombstones matter: a deleted element still has to reach peers.
    sync.push(api.getSceneElementsIncludingDeleted());
  }, [api, sync]);

  const schedulePush = useCallback(() => {
    if (pushTimer.current) clearTimeout(pushTimer.current);

    // Debounce, but never let a continuous stroke go unpublished for longer
    // than the ceiling.
    if (Date.now() - lastPushAt.current >= PUSH_MAX_WAIT_MS) {
      push();
      return;
    }
    pushTimer.current = setTimeout(push, PUSH_DEBOUNCE_MS);
  }, [push]);

  // Apply remote changes. Our own writes are tagged and skipped.
  useEffect(() => {
    if (!api || !lib) return;

    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === LOCAL_ORIGIN) return;
      pull();
    };

    doc.on("update", onUpdate);
    // Paint whatever is already in the doc (IndexedDB cache or an earlier sync).
    pull();

    return () => {
      doc.off("update", onUpdate);
    };
  }, [api, lib, doc, pull]);

  // Peer cursors: Excalidraw renders these itself given a collaborators map.
  useEffect(() => {
    if (!api) return;

    const collaborators = new Map(
      peers
        .filter((p) => p.cursor)
        .map((p) => [
          String(p.clientId),
          {
            username: p.name,
            pointer: { x: p.cursor!.x, y: p.cursor!.y, tool: "pointer" as const },
            color: { background: p.color, stroke: p.color },
            id: String(p.clientId),
          },
        ]),
    );

    api.updateScene({ collaborators: collaborators as never });
  }, [api, peers]);

  // Publish anything still pending when the tab goes away.
  useEffect(() => {
    const flush = () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      push();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [push]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1">
        {!ready ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-cream-100 text-sm text-stone-500">
            Loading whiteboard…
          </div>
        ) : null}

        {/* Presence floats over the canvas rather than owning a header bar. */}
        {presentation ? null : (
          <div className="pointer-events-none absolute right-3 top-3 z-30">
            <div className="pointer-events-auto rounded-md border border-cream-300 bg-cream-50/95 px-2 py-1 shadow-card">
              <PresenceBar status={status} peers={peers} participantCount={participantCount} />
            </div>
          </div>
        )}

        <Excalidraw
          excalidrawAPI={setApi}
          onChange={schedulePush}
          onPointerUpdate={(payload) => setCursor(payload.pointer)}
          isCollaborating
          // Light mode only, matching the rest of the app.
          theme="light"
          UIOptions={{ canvasActions: { toggleTheme: false } }}
        />
      </div>
    </div>
  );
}
