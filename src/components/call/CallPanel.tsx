"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { api } from "@/lib/api";
import {
  openShareChannel,
  shareUrl,
  type ShareMessage,
  type ShareView,
} from "@/lib/livekit/shareChannel";
import { CallStage } from "./CallStage";
import { CallHistory } from "./CallHistory";
import { PermissionControls } from "./PermissionControls";

type CallStatus = {
  active: { id: string; startedAt: string; participants: { email: string }[] } | null;
};

type Credentials = { token: string; url: string };

/**
 * Call entry point for a case.
 *
 * Joining is deliberately explicit: opening a case must never switch on a
 * camera or microphone, so nothing connects to LiveKit until "Start call" is
 * pressed, and mic/camera both begin muted.
 */
export function CallPanel({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [status, setStatus] = useState<CallStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [sharing, setSharing] = useState(false);
  const [shareView, setShareView] = useState<ShareView>("board");
  const channelRef = useRef<BroadcastChannel | null>(null);
  const shareWindowRef = useRef<Window | null>(null);

  // Who is already on the call, so the button can say "Join" rather than "Start".
  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.get<CallStatus>(`/api/cases/${caseId}/call`));
    } catch {
      // Status is informational; failing to read it must not block joining.
    }
  }, [caseId]);

  useEffect(() => {
    void refreshStatus();
    if (credentials) return;
    const timer = setInterval(refreshStatus, 10_000);
    return () => clearInterval(timer);
  }, [credentials, refreshStatus]);

  // Listen for the share tab reporting its state.
  useEffect(() => {
    const channel = openShareChannel(caseId);
    channelRef.current = channel;
    if (!channel) return;

    channel.onmessage = (event: MessageEvent<ShareMessage>) => {
      const message = event.data;
      if (message.type === "share-state") {
        setSharing(message.sharing);
        setShareView(message.view);
      }
      if (message.type === "hello") {
        channel.postMessage({ type: "set-view", view: shareView } satisfies ShareMessage);
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
    // shareView intentionally excluded: re-opening the channel on every view
    // change would drop messages mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const creds = await api.post<Credentials>(`/api/cases/${caseId}/call/token`, {
        kind: "member",
      });
      setCredentials(creds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the call");
    } finally {
      setJoining(false);
    }
  }

  const leave = useCallback(async () => {
    stopShare();
    setCredentials(null);
    try {
      await api.post(`/api/cases/${caseId}/call/leave`, {});
    } catch {
      // The log reconciles against LiveKit anyway.
    }
    void refreshStatus();
  }, [caseId, refreshStatus]);

  function startShare(view: ShareView) {
    setShareView(view);
    // Opened as a real tab, not a popup: tab capture is what keeps the share
    // scoped, and a popup window would not appear in the browser's tab list.
    shareWindowRef.current = window.open(shareUrl(caseId, view), `caseboard-share-${caseId}`);
  }

  function stopShare() {
    channelRef.current?.postMessage({ type: "stop" } satisfies ShareMessage);
    shareWindowRef.current = null;
    setSharing(false);
  }

  function switchShareView(view: ShareView) {
    setShareView(view);
    channelRef.current?.postMessage({ type: "set-view", view } satisfies ShareMessage);
  }

  // Log the departure if the whole tab goes away mid-call.
  useEffect(() => {
    if (!credentials) return;
    const onUnload = () => {
      navigator.sendBeacon?.(`/api/cases/${caseId}/call/leave`, new Blob([], { type: "text/plain" }));
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [caseId, credentials]);

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-cream-300 bg-cream-50 sm:w-80">
      <div className="flex items-center justify-between border-b border-cream-300 px-3 py-2">
        <h2 className="text-sm font-semibold text-stone-800">Call</h2>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={onClose}>
          Close
        </button>
      </div>

      {credentials ? (
        <div className="min-h-0 flex-1">
          <LiveKitRoom
            token={credentials.token}
            serverUrl={credentials.url}
            connect
            // Opening a case must never hot-mic anyone.
            audio={false}
            video={false}
            onDisconnected={() => void leave()}
            onError={(err) => {
              // A dead or unreachable media server would otherwise leave the
              // panel stuck on "Connecting…" forever. Drop back to the join
              // screen with something the user can act on.
              setError(
                `Couldn't reach the call server. ${err.message}. Is LiveKit running?`,
              );
              setCredentials(null);
            }}
            className="h-full"
          >
            <CallStage
              caseId={caseId}
              onLeave={() => void leave()}
              onStartShare={startShare}
              onStopShare={stopShare}
              onSwitchShareView={switchShareView}
              sharing={sharing}
              shareView={shareView}
            />
          </LiveKitRoom>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error ? <p className="mb-3 text-sm text-clay-600">{error}</p> : null}

          <p className="text-sm text-stone-600">
            {status?.active
              ? `${status.active.participants.length} already on a call for this case.`
              : "No call running for this case."}
          </p>

          <button className="btn-primary mt-3 w-full" onClick={join} disabled={joining}>
            {joining ? "Connecting…" : status?.active ? "Join call" : "Start call"}
          </button>

          <p className="mt-2 text-xs text-stone-500">
            Your microphone and camera start off. Everyone on the call can still edit the board.
          </p>

          <CallHistory caseId={caseId} />
        </div>
      )}
    </aside>
  );
}
