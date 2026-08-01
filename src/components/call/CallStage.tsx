"use client";

import { useMemo, useState } from "react";
import { Track } from "livekit-client";
import {
  RoomAudioRenderer,
  VideoTrack,
  useChat,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import type {
  TrackReference,
  TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import type { ShareView } from "@/lib/livekit/shareChannel";
import { PermissionControls } from "./PermissionControls";

const SHARE_SUFFIX = "__share";

/**
 * `useTracks` returns placeholders for participants with no published track
 * (camera off). Only real references can be rendered.
 */
const isPublished = (t: TrackReferenceOrPlaceholder): t is TrackReference =>
  t.publication !== undefined;

const isShare = (identity: string) => identity.endsWith(SHARE_SUFFIX);
const baseIdentity = (identity: string) =>
  isShare(identity) ? identity.slice(0, -SHARE_SUFFIX.length) : identity;

/**
 * Call surface: participant tiles, controls, the pinned screen share, and chat.
 * Rendered inside a LiveKitRoom, so all the hooks here have room context.
 */
export function CallStage({
  caseId,
  onLeave,
  onStartShare,
  onStopShare,
  onSwitchShareView,
  sharing,
  shareView,
}: {
  caseId: string;
  onLeave: () => void;
  onStartShare: (view: ShareView) => void;
  onStopShare: () => void;
  onSwitchShareView: (view: ShareView) => void;
  sharing: boolean;
  shareView: ShareView;
}) {
  const connection = useConnectionState();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const screenTrack = tracks
    .filter(isPublished)
    .find((t) => t.publication.source === Track.Source.ScreenShare);

  const cameraTracks = useMemo(
    () =>
      tracks.filter(
        (t) =>
          t.source === Track.Source.Camera &&
          // The share connection is a publishing endpoint, not a person.
          !isShare(t.participant.identity),
      ),
    [tracks],
  );

  // People, counted once — a user sharing their screen is still one attendee.
  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of participants) {
      if (isShare(p.identity)) continue;
      seen.set(baseIdentity(p.identity), p.name || p.identity);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [participants]);

  async function toggleMic() {
    const next = !micOn;
    await localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  async function toggleCam() {
    const next = !camOn;
    await localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }

  const sharerName = screenTrack
    ? people.find((p) => p.id === baseIdentity(screenTrack.participant.identity))?.name ??
      "Someone"
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Plays every remote audio track; without it nobody can be heard. */}
      <RoomAudioRenderer />

      <div className="flex items-center justify-between border-b border-cream-300 px-3 py-2">
        <span className="text-xs text-stone-500">
          {connection === "connected"
            ? `${people.length} on the call`
            : connection === "connecting"
              ? "Connecting…"
              : connection === "reconnecting"
                ? "Reconnecting…"
                : "Disconnected"}
        </span>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowChat((s) => !s)}>
          {showChat ? "Hide chat" : "Chat"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {screenTrack ? (
          <figure className="mb-3">
            <div className="overflow-hidden rounded-lg border border-cream-300 bg-stone-800">
              <VideoTrack trackRef={screenTrack} className="block max-h-64 w-full object-contain" />
            </div>
            <figcaption className="mt-1 text-xs text-stone-500">
              {sharerName} is sharing their {shareView === "board" ? "board" : "whiteboard"}
            </figcaption>
          </figure>
        ) : null}

        <ul className="grid grid-cols-2 gap-2">
          {cameraTracks.map((trackRef) => {
            const name = trackRef.participant.name || trackRef.participant.identity;
            const live = isPublished(trackRef) && !trackRef.publication.isMuted;

            return (
              <li
                key={`${trackRef.participant.identity}-${trackRef.source}`}
                className="relative overflow-hidden rounded-md border border-cream-300 bg-cream-200"
              >
                <div className="aspect-video">
                  {live && isPublished(trackRef) ? (
                    <VideoTrack trackRef={trackRef} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-lg font-semibold text-terracotta-600">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="absolute bottom-1 left-1 truncate rounded bg-stone-800/70 px-1.5 py-0.5 text-[11px] text-cream-50">
                  {name}
                  {trackRef.participant.isLocal ? " (you)" : ""}
                </span>
              </li>
            );
          })}
        </ul>

        {people.length <= 1 ? (
          <p className="mt-3 text-xs text-stone-500">
            Nobody else has joined yet. Anyone with access to this case can join from their own
            copy of it.
          </p>
        ) : null}
      </div>

      <PermissionControls caseId={caseId} />

      {showChat ? <ChatPanel /> : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-cream-300 p-3">
        <button className={micOn ? "btn-primary" : "btn-secondary"} onClick={toggleMic}>
          {micOn ? "Mute" : "Unmute"}
        </button>
        <button className={camOn ? "btn-primary" : "btn-secondary"} onClick={toggleCam}>
          {camOn ? "Camera off" : "Camera on"}
        </button>

        {sharing ? (
          <>
            <button className="btn-secondary" onClick={onStopShare}>
              Stop sharing
            </button>
            {/* Swapping the view leaves the published track untouched. */}
            <button
              className="btn-ghost text-xs"
              onClick={() => onSwitchShareView(shareView === "board" ? "whiteboard" : "board")}
            >
              Show {shareView === "board" ? "whiteboard" : "board"}
            </button>
          </>
        ) : (
          <button className="btn-secondary" onClick={() => onStartShare(shareView)}>
            Share my board
          </button>
        )}

        <button className="btn-danger ml-auto" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}

/** Ephemeral chat over LiveKit's data channel. Nothing is persisted. */
function ChatPanel() {
  const { chatMessages, send } = useChat();
  const [draft, setDraft] = useState("");

  return (
    <div className="flex max-h-56 flex-col border-t border-cream-300">
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
        {chatMessages.length === 0 ? (
          <li className="text-xs text-stone-500">
            Messages here last only as long as the call.
          </li>
        ) : null}
        {chatMessages.map((message) => (
          <li key={message.id} className="text-sm">
            <span className="font-medium text-stone-700">
              {message.from?.name || message.from?.identity || "Someone"}
            </span>
            <span className="ml-2 text-stone-600">{message.message}</span>
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2 px-3 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          void send(text);
          setDraft("");
        }}
      >
        <input
          className="field flex-1"
          placeholder="Message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn-secondary">
          Send
        </button>
      </form>
    </div>
  );
}
