// Entity shapes live in the realtime layer so the websocket server can share
// them without importing React components.
export type {
  Confidence,
  Connector,
  Direction,
  Group,
  Person,
} from "@/lib/realtime/entities";

import type { Confidence, Person } from "@/lib/realtime/entities";

/** Editable subset — what the editor form round-trips. */
export type PersonDraft = {
  name: string;
  photoUrl: string | null;
  notes: string;
  tags: string[];
  role: string;
  location: string;
  source: string;
};

export function toDraft(p: Person): PersonDraft {
  return {
    name: p.name,
    photoUrl: p.photoUrl,
    notes: p.notes ?? "",
    tags: p.tags,
    role: p.role ?? "",
    location: p.location ?? "",
    source: p.source ?? "",
  };
}

export const emptyDraft = (): PersonDraft => ({
  name: "",
  photoUrl: null,
  notes: "",
  tags: [],
  role: "",
  location: "",
  source: "",
});

export type SaveState = "idle" | "saving" | "saved" | "error";

// ---- Phase 2 ---------------------------------------------------------------

import type { Direction } from "@/lib/realtime/entities";

export const CONFIDENCE_OPTIONS: { value: Confidence; label: string; hint: string }[] = [
  { value: "confirmed", label: "Confirmed", hint: "Solid line" },
  { value: "alleged", label: "Alleged", hint: "Dashed line" },
  { value: "unconfirmed", label: "Unconfirmed", hint: "Dotted line" },
];

export const DIRECTION_OPTIONS: { value: Direction; label: string; hint: string }[] = [
  { value: "none", label: "No direction", hint: "Plain line" },
  { value: "forward", label: "One way", hint: "Arrow at the far end" },
  { value: "both", label: "Both ways", hint: "Arrow at each end" },
];

/**
 * Muted, warm line colours. Deliberately low-saturation so a dense board stays
 * readable — confidence is carried mainly by the dash pattern.
 */
export const CONNECTOR_STYLE: Record<Confidence, { stroke: string; dash?: string }> = {
  confirmed: { stroke: "#475569" },
  alleged: { stroke: "#D97706", dash: "8 5" },
  unconfirmed: { stroke: "#94A3B8", dash: "2 5" },
};
