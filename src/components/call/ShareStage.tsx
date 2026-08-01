"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, Track, type LocalVideoTrack } from "livekit-client";
import { Board } from "@/components/board/Board";
import { Whiteboard } from "@/components/whiteboard/Whiteboard";
import { openShareChannel, type ShareMessage, type ShareView } from "@/lib/livekit/shareChannel";

/**
 * Capture constraints that keep the share scoped to this tab.
 *
 * `monitorTypeSurfaces: "exclude"` is the important one — it removes whole
 * screens from the picker entirely, so the riskiest choice (sharing the desktop,
 * along with every other window and notification on it) cannot be made by
 * accident. The rest bias the picker towards this tab and stop the user
 * switching to a different surface mid-share.
 *
 * These are Chromium-specific hints and are not in the DOM lib types yet.
 */
const SCOPED_CAPTURE = {
  video: { displaySurface: "browser" },
  audio: false,
  preferCurrentTab: true,
  selfBrowserSurface: "include",
  surfaceSwitching: "exclude",
  monitorTypeSurfaces: "exclude",
} as unknown as DisplayMediaStreamOptions;

type Status = "idle" | "starting" | "sharing" | "error";

export function ShareStage({
  caseId,
  caseTitle,
  initialView,
}: {
  caseId: string;
  caseTitle: string;
  initialView: ShareView;
}) {
  const [view, setView] = useState<ShareView>(initialView);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const trackRef = useRef<LocalVideoTrack | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const post = useCallback((message: ShareMessage) => {
    channelRef.current?.postMessage(message);
  }, []);

  const stop = useCallback(
    async (closeTab: boolean) => {
      const track = trackRef.current;
      trackRef.current = null;
      const room = roomRef.current;
      roomRef.current = null;

      if (track) {
        try {
          await room?.localParticipant.unpublishTrack(track, true);
        } catch {
          // Room may already be gone.
        }
        track.stop();
      }
      await room?.disconnect();

      setStatus("idle");
      post({ type: "share-state", sharing: false, view: viewRef.current });

      if (closeTab) window.close();
    },
    [post],
  );

  const start = useCallback(async () => {
    setStatus("starting");
    setError(null);

    try {
      const res = await fetch(`/api/cases/${caseId}/call/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "share" }),
      });
      if (!res.ok) throw new Error("Could not authorise the share session");
      const { token, url } = (await res.json()) as { token: string; url: string };

      const stream = await navigator.mediaDevices.getDisplayMedia(SCOPED_CAPTURE);
      const [mediaTrack] = stream.getVideoTracks();
      if (!mediaTrack) throw new Error("No video track was captured");

      const room = new Room();
      await room.connect(url, token);
      roomRef.current = room;

      const published = await room.localParticipant.publishTrack(mediaTrack, {
        source: Track.Source.ScreenShare,
        name: "caseboard-view",
      });
      trackRef.current = (published.track as LocalVideoTrack) ?? null;

      // Fires when the user stops the share from the browser's own bar.
      mediaTrack.addEventListener("ended", () => {
        void stop(false);
      });

      setStatus("sharing");
      post({ type: "share-state", sharing: true, view: viewRef.current });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start sharing";
      // Cancelling the browser picker is a normal action, not a failure.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setStatus("idle");
        return;
      }
      setError(message);
      setStatus("error");
    }
  }, [caseId, post, stop]);

  // Talk to the main case tab.
  useEffect(() => {
    const channel = openShareChannel(caseId);
    channelRef.current = channel;
    if (!channel) return;

    channel.onmessage = (event: MessageEvent<ShareMessage>) => {
      const message = event.data;
      if (message.type === "set-view") {
        // Swapping what this tab renders does not touch the published track, so
        // the call and the share both continue uninterrupted.
        setView(message.view);
        post({
          type: "share-state",
          sharing: trackRef.current !== null,
          view: message.view,
        });
      }
      if (message.type === "stop") void stop(true);
      if (message.type === "hello") {
        post({ type: "share-state", sharing: trackRef.current !== null, view: viewRef.current });
      }
    };

    post({ type: "hello" });

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [caseId, post, stop]);

  // Tear the track down if this tab is closed directly.
  useEffect(() => {
    const onUnload = () => {
      trackRef.current?.stop();
      void roomRef.current?.disconnect();
    };
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      onUnload();
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      {/*
        Rendered without chrome: this is the surface other people will see, so it
        carries the board and nothing that could expose another case or account.
      */}
      <div className="h-full w-full">
        {view === "board" ? (
          <Board caseId={caseId} caseTitle={caseTitle} presentation />
        ) : (
          <Whiteboard caseId={caseId} presentation />
        )}
      </div>

      {/*
        The setup prompt only exists before capture begins. Once sharing starts
        it disappears, so viewers see the board alone. Stopping is driven from
        the main case tab.
      */}
      {status !== "sharing" ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-800/40 p-4">
          <div className="surface w-full max-w-md p-6 text-center shadow-panel">
            <h1 className="text-base font-semibold text-stone-800">Share this tab</h1>
            <p className="mt-2 text-sm text-stone-600">
              This tab shows only the {view === "board" ? "investigation board" : "whiteboard"}{" "}
              for <span className="font-medium">{caseTitle}</span> — nothing else from CaseBoard
              and nothing else on your machine.
            </p>
            <p className="mt-3 rounded-md bg-cream-200 px-3 py-2 text-sm text-stone-700">
              When the browser asks, choose <strong>This tab</strong>. Whole screens are
              deliberately not offered.
            </p>

            {error ? <p className="mt-3 text-sm text-clay-600">{error}</p> : null}

            <button
              className="btn-primary mt-5 w-full"
              onClick={start}
              disabled={status === "starting"}
            >
              {status === "starting" ? "Starting…" : "Start sharing"}
            </button>
            <p className="mt-3 text-xs text-stone-500">
              Stop sharing from the case tab, or just close this one.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
