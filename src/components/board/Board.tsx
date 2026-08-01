"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBoardRoom } from "@/lib/realtime/useBoardRoom";
import { usePermission } from "@/lib/realtime/usePermission";
import { DesktopNotice } from "./DesktopNotice";
import { Minimap } from "./Minimap";
import { VersionHistory } from "./VersionHistory";
import { ConnectorEditor, type ConnectorDraft } from "./ConnectorEditor";
import { ConnectorLayer } from "./ConnectorLayer";
import { ExportMenu } from "./ExportMenu";
import {
  boundingBox,
  rectContains,
  rectFromPoints,
  rectsIntersect,
  type Rect,
} from "./geometry";
import { GroupEditor, type GroupDraft } from "./GroupEditor";
import { GroupLayer } from "./GroupLayer";
import { CARD_ESTIMATED_HEIGHT, CARD_WIDTH, PersonCard } from "./PersonCard";
import { PersonEditor } from "./PersonEditor";
import { PersonPicker } from "./PersonPicker";
import { PresenceBar, PresenceCursors } from "./Presence";
import { emptyDraft, toDraft, type Connector, type Group, type Person, type PersonDraft } from "./types";

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;
/** Pointer travel (screen px) below which a card interaction counts as a click, not a drag. */
const CLICK_SLOP = 4;
/** Padding around a selection's bounding box when it becomes a group. */
const GROUP_PADDING = 28;
/** Presence cursors are cosmetic — cap how often they go on the wire. */
const CURSOR_THROTTLE_MS = 50;

type View = { x: number; y: number; scale: number };

type Gesture =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
  // `box` / `overId` are written on every move so pointerup reads a settled
  // value instead of racing a pending render.
  | { kind: "marquee"; ax: number; ay: number; box: Rect }
  | { kind: "drawGroup"; ax: number; ay: number; box: Rect }
  | {
      kind: "cards";
      primaryId: string;
      ids: string[];
      sx: number;
      sy: number;
      origins: Map<string, { x: number; y: number }>;
      moved: boolean;
    }
  | {
      kind: "group";
      id: string;
      sx: number;
      sy: number;
      origin: { x: number; y: number; width: number; height: number };
      memberOrigins: Map<string, { x: number; y: number }>;
      moved: boolean;
    }
  | {
      kind: "groupResize";
      id: string;
      sx: number;
      sy: number;
      origin: { x: number; y: number; width: number; height: number };
      moved: boolean;
    }
  | { kind: "link"; fromId: string; overId: string | null };

/** Flat dot grid so panning has a visual reference. Solid dots, no gradient. */
const DOT_GRID =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='1.5' cy='1.5' r='1.5' fill='%23E2E8F0'/></svg>\")";

export function Board({
  caseId,
  caseTitle,
  presentation = false,
}: {
  caseId: string;
  caseTitle: string;
  /**
   * Strips the toolbar so the canvas is the only thing on screen. Used by the
   * scoped screen-share route, where every pixel is broadcast to other people.
   */
  presentation?: boolean;
}) {
  // The Yjs document is the source of truth. `board` is a read-only mirror of it,
  // rebuilt whenever the doc changes — locally or from a peer.
  const { permission } = usePermission(caseId);
  const { board, actions, status, peers, participantCount, ready, setCursor, canEdit, undo, redo } =
    useBoardRoom(caseId, permission);
  const { people, connectors, groups } = board;

  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [query, setQuery] = useState("");
  const [drawMode, setDrawMode] = useState(false);

  const [activeCardIds, setActiveCardIds] = useState<string[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [drawRect, setDrawRect] = useState<Rect | null>(null);
  const [linkDraft, setLinkDraft] = useState<{
    fromId: string;
    x: number;
    y: number;
    overId: string | null;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [heights, setHeights] = useState<Record<string, number>>({});

  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [creatingPersonAt, setCreatingPersonAt] = useState<{ x: number; y: number } | null>(null);
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null);
  const [creatingConnector, setCreatingConnector] = useState<{
    fromId: string;
    toId: string;
  } | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState<{
    rect: Rect;
    memberIds: string[];
  } | null>(null);
  const [pickerFromId, setPickerFromId] = useState<string | null>(null);
  const [cardMenu, setCardMenu] = useState<{ person: Person; x: number; y: number } | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const lastCursorSentRef = useRef(0);

  const viewRef = useRef(view);
  viewRef.current = view;
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Modals hold ids, not snapshots, so a peer's concurrent edit to the same
  // entity shows up live in the open editor instead of being overwritten on save.
  const editingPerson = useMemo(
    () => people.find((p) => p.id === editingPersonId) ?? null,
    [people, editingPersonId],
  );
  const editingConnector = useMemo(
    () => connectors.find((c) => c.id === editingConnectorId) ?? null,
    [connectors, editingConnectorId],
  );
  const editingGroup = useMemo(
    () => groups.find((g) => g.id === editingGroupId) ?? null,
    [groups, editingGroupId],
  );
  const pickerFrom = useMemo(
    () => people.find((p) => p.id === pickerFromId) ?? null,
    [people, pickerFromId],
  );

  // ---- Card geometry ---------------------------------------------------------

  const onMeasure = useCallback((id: string, height: number) => {
    setHeights((prev) => (prev[id] === height ? prev : { ...prev, [id]: height }));
  }, []);

  const rects = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const p of people) {
      map.set(p.id, {
        x: p.x,
        y: p.y,
        width: CARD_WIDTH,
        height: heights[p.id] ?? CARD_ESTIMATED_HEIGHT,
      });
    }
    return map;
  }, [people, heights]);

  const rectsRef = useRef(rects);
  rectsRef.current = rects;

  // ---- Coordinate helpers ----------------------------------------------------

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - v.x) / v.scale,
      y: (clientY - (rect?.top ?? 0) - v.y) / v.scale,
    };
  }, []);

  const viewportCenterWorld = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { x: Math.round(center.x - CARD_WIDTH / 2), y: Math.round(center.y - 60) };
  }, [screenToWorld]);

  /** Topmost card under a world point — later cards render above earlier ones. */
  const cardAt = useCallback((wx: number, wy: number, excludeId?: string) => {
    const list = peopleRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const person = list[i];
      if (person.id === excludeId) continue;
      const r = rectsRef.current.get(person.id);
      if (!r) continue;
      if (wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height) return person;
    }
    return null;
  }, []);

  // ---- Global pointer handling ----------------------------------------------

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const world = screenToWorld(e.clientX, e.clientY);

      // Broadcast the pointer regardless of gesture, so peers can follow along.
      const now = Date.now();
      if (now - lastCursorSentRef.current > CURSOR_THROTTLE_MS) {
        lastCursorSentRef.current = now;
        setCursor(world);
      }

      const g = gestureRef.current;
      if (!g) return;

      switch (g.kind) {
        case "pan":
          setView((v) => ({ ...v, x: g.ox + (e.clientX - g.sx), y: g.oy + (e.clientY - g.sy) }));
          return;

        case "marquee":
          g.box = rectFromPoints(g.ax, g.ay, world.x, world.y);
          setMarquee(g.box);
          return;

        case "drawGroup":
          g.box = rectFromPoints(g.ax, g.ay, world.x, world.y);
          setDrawRect(g.box);
          return;

        case "link": {
          const over = cardAt(world.x, world.y, g.fromId);
          g.overId = over?.id ?? null;
          setLinkDraft({ fromId: g.fromId, x: world.x, y: world.y, overId: g.overId });
          return;
        }

        case "cards": {
          const dx = e.clientX - g.sx;
          const dy = e.clientY - g.sy;
          if (!g.moved && Math.hypot(dx, dy) > CLICK_SLOP) g.moved = true;
          if (!g.moved) return;

          const scale = viewRef.current.scale;
          const moves = Array.from(g.origins, ([id, origin]) => ({
            id,
            x: origin.x + dx / scale,
            y: origin.y + dy / scale,
          }));

          // Written straight to Yjs so peers see the drag as it happens rather
          // than only on release.
          actionsRef.current.movePeople(moves);
          return;
        }

        case "group": {
          const dx = e.clientX - g.sx;
          const dy = e.clientY - g.sy;
          if (!g.moved && Math.hypot(dx, dy) > CLICK_SLOP) g.moved = true;
          if (!g.moved) return;

          const scale = viewRef.current.scale;
          const wx = dx / scale;
          const wy = dy / scale;

          actionsRef.current.moveGroup(
            g.id,
            {
              x: g.origin.x + wx,
              y: g.origin.y + wy,
              width: g.origin.width,
              height: g.origin.height,
            },
            Array.from(g.memberOrigins, ([id, origin]) => ({
              id,
              x: origin.x + wx,
              y: origin.y + wy,
            })),
          );
          return;
        }

        case "groupResize": {
          const dx = e.clientX - g.sx;
          const dy = e.clientY - g.sy;
          if (!g.moved && Math.hypot(dx, dy) > CLICK_SLOP) g.moved = true;
          if (!g.moved) return;

          const scale = viewRef.current.scale;
          actionsRef.current.updateGroup(g.id, {
            width: Math.max(80, g.origin.width + dx / scale),
            height: Math.max(80, g.origin.height + dy / scale),
          });
          return;
        }
      }
    }

    function onUp() {
      const g = gestureRef.current;
      gestureRef.current = null;

      setActiveCardIds([]);
      setActiveGroupId(null);

      if (!g) return;

      switch (g.kind) {
        case "marquee": {
          setMarquee(null);
          if (g.box.width > 4 && g.box.height > 4) {
            setSelectedIds(
              peopleRef.current
                .filter((p) => {
                  const r = rectsRef.current.get(p.id);
                  return r ? rectsIntersect(g.box, r) : false;
                })
                .map((p) => p.id),
            );
          }
          return;
        }

        case "drawGroup": {
          setDrawRect(null);
          setDrawMode(false);
          if (g.box.width > 40 && g.box.height > 40) {
            const memberIds = peopleRef.current
              .filter((p) => {
                const r = rectsRef.current.get(p.id);
                return r ? rectContains(g.box, r) : false;
              })
              .map((p) => p.id);
            setCreatingGroup({ rect: g.box, memberIds });
          }
          return;
        }

        case "link": {
          setLinkDraft(null);
          if (g.overId) setCreatingConnector({ fromId: g.fromId, toId: g.overId });
          return;
        }

        case "cards": {
          // Positions are already in the doc — a drag needs no save step now.
          if (!g.moved) setEditingPersonId(g.primaryId);
          return;
        }
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [cardAt, screenToWorld, setCursor]);

  // Stop advertising a cursor once the pointer leaves the canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const clear = () => setCursor(null);
    el.addEventListener("pointerleave", clear);
    return () => el.removeEventListener("pointerleave", clear);
  }, [setCursor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      gestureRef.current = null;
      setMarquee(null);
      setDrawRect(null);
      setLinkDraft(null);
      setDrawMode(false);
      setSelectedIds([]);
      setCardMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Editing shortcuts: undo/redo, delete, and arrow-nudge the current selection.
  useEffect(() => {
    if (!canEdit) return;

    const onKey = (e: KeyboardEvent) => {
      // Never hijack typing in a field or an open editor.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if (selectedIds.length === 0) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        for (const id of selectedIds) actions.deletePerson(id);
        setSelectedIds([]);
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;

      e.preventDefault();
      const moves = selectedIds
        .map((id) => {
          const p = peopleRef.current.find((pp) => pp.id === id);
          return p ? { id, x: p.x + dx, y: p.y + dy } : null;
        })
        .filter((m): m is { id: string; x: number; y: number } => m !== null);
      if (moves.length > 0) actions.movePeople(moves);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, selectedIds, actions, undo, redo]);

  // Arriving from a global-search result (/case/[id]?focus=<personId>): once the
  // card exists, centre the viewport on it and select it. Runs once per id.
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    const focusId = new URLSearchParams(window.location.search).get("focus");
    if (!focusId || focusedRef.current === focusId) return;
    const p = people.find((pp) => pp.id === focusId);
    if (!p) return; // not loaded yet — try again on the next board update

    const el = containerRef.current;
    const cw = el?.clientWidth ?? 0;
    const ch = el?.clientHeight ?? 0;
    const h = heights[p.id] ?? CARD_ESTIMATED_HEIGHT;
    setView({
      scale: 1,
      x: cw / 2 - (p.x + CARD_WIDTH / 2),
      y: ch / 2 - (p.y + h / 2),
    });
    setSelectedIds([p.id]);
    focusedRef.current = focusId;
  }, [people, heights]);

  // ---- Gesture starts --------------------------------------------------------

  function onBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    setCardMenu(null);

    const world = screenToWorld(e.clientX, e.clientY);
    const empty = { x: world.x, y: world.y, width: 0, height: 0 };

    if (drawMode && canEdit) {
      gestureRef.current = { kind: "drawGroup", ax: world.x, ay: world.y, box: empty };
      setDrawRect(empty);
      return;
    }

    if (e.shiftKey) {
      gestureRef.current = { kind: "marquee", ax: world.x, ay: world.y, box: empty };
      setMarquee(empty);
      return;
    }

    setSelectedIds([]);
    gestureRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
  }

  function onCardPointerDown(e: React.PointerEvent, person: Person) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setCardMenu(null);

    // View-only: a click still opens the card (read-only), but it cannot be moved.
    if (!canEdit) {
      setEditingPersonId(person.id);
      return;
    }

    const ids = selectedIds.includes(person.id) ? selectedIds : [person.id];
    const origins = new Map<string, { x: number; y: number }>();
    for (const id of ids) {
      const p = peopleRef.current.find((q) => q.id === id);
      if (p) origins.set(id, { x: p.x, y: p.y });
    }

    gestureRef.current = {
      kind: "cards",
      primaryId: person.id,
      ids,
      sx: e.clientX,
      sy: e.clientY,
      origins,
      moved: false,
    };
    setActiveCardIds(ids);
  }

  function onLinkPointerDown(e: React.PointerEvent, person: Person) {
    if (e.button !== 0 || !canEdit) return;
    const world = screenToWorld(e.clientX, e.clientY);
    gestureRef.current = { kind: "link", fromId: person.id, overId: null };
    setLinkDraft({ fromId: person.id, x: world.x, y: world.y, overId: null });
  }

  function onGroupPointerDown(e: React.PointerEvent, group: Group) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setCardMenu(null);
    if (!canEdit) return;

    const memberOrigins = new Map<string, { x: number; y: number }>();
    for (const id of group.memberIds) {
      const p = peopleRef.current.find((q) => q.id === id);
      if (p) memberOrigins.set(id, { x: p.x, y: p.y });
    }

    gestureRef.current = {
      kind: "group",
      id: group.id,
      sx: e.clientX,
      sy: e.clientY,
      origin: { x: group.x, y: group.y, width: group.width, height: group.height },
      memberOrigins,
      moved: false,
    };
    setActiveGroupId(group.id);
  }

  function onGroupResizePointerDown(e: React.PointerEvent, group: Group) {
    if (e.button !== 0 || !canEdit) return;
    gestureRef.current = {
      kind: "groupResize",
      id: group.id,
      sx: e.clientX,
      sy: e.clientY,
      origin: { x: group.x, y: group.y, width: group.width, height: group.height },
      moved: false,
    };
    setActiveGroupId(group.id);
  }

  // ---- Zoom ------------------------------------------------------------------

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    setView((v) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      if (next === v.scale) return v;

      const rect = containerRef.current?.getBoundingClientRect();
      const sx = clientX - (rect?.left ?? 0);
      const sy = clientY - (rect?.top ?? 0);

      const wx = (sx - v.x) / v.scale;
      const wy = (sy - v.y) / v.scale;

      return { scale: next, x: sx - wx * next, y: sy - wy * next };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaY, y: v.y }));
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  function zoomButton(factor: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  // ---- Filtering -------------------------------------------------------------

  const filter = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const peopleHits = new Set(
      people
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)),
        )
        .map((p) => p.id),
    );

    const connectorHits = new Set<string>();
    for (const c of connectors) {
      const labelHit = (c.label ?? "").toLowerCase().includes(q);
      if (labelHit || (peopleHits.has(c.fromId) && peopleHits.has(c.toId))) {
        connectorHits.add(c.id);
      }
    }

    // A matched connector drags its endpoints into view — a highlighted link
    // between two faded cards would be unreadable.
    for (const c of connectors) {
      if (!connectorHits.has(c.id)) continue;
      peopleHits.add(c.fromId);
      peopleHits.add(c.toId);
    }

    const groupHits = new Set(
      groups
        .filter(
          (g) =>
            g.label.toLowerCase().includes(q) || g.memberIds.some((id) => peopleHits.has(id)),
        )
        .map((g) => g.id),
    );

    return {
      dimmedPeople: new Set(people.filter((p) => !peopleHits.has(p.id)).map((p) => p.id)),
      dimmedConnectors: new Set(
        connectors.filter((c) => !connectorHits.has(c.id)).map((c) => c.id),
      ),
      dimmedGroups: new Set(groups.filter((g) => !groupHits.has(g.id)).map((g) => g.id)),
      counts: { people: peopleHits.size, connectors: connectorHits.size },
    };
  }, [connectors, groups, people, query]);

  // ---- Mutations (all through Yjs) -------------------------------------------

  async function savePerson(draft: PersonDraft) {
    const fields = {
      name: draft.name,
      photoUrl: draft.photoUrl,
      notes: draft.notes || null,
      tags: draft.tags,
      role: draft.role || null,
      location: draft.location || null,
      source: draft.source || null,
    };

    if (editingPerson) {
      actions.updatePerson(editingPerson.id, fields);
      setEditingPersonId(null);
    } else if (creatingPersonAt) {
      actions.addPerson({ ...fields, x: creatingPersonAt.x, y: creatingPersonAt.y });
      setCreatingPersonAt(null);
    }
  }

  async function deletePerson() {
    if (!editingPerson) return;
    const id = editingPerson.id;
    actions.deletePerson(id);
    setSelectedIds((prev) => prev.filter((s) => s !== id));
    setEditingPersonId(null);
  }

  async function saveConnector(draft: ConnectorDraft) {
    const fields = {
      label: draft.label || null,
      confidence: draft.confidence,
      direction: draft.direction,
    };

    if (editingConnector) {
      actions.updateConnector(editingConnector.id, fields);
      setEditingConnectorId(null);
    } else if (creatingConnector) {
      actions.addConnector({ ...fields, ...creatingConnector });
      setCreatingConnector(null);
    }
  }

  async function deleteConnector() {
    if (!editingConnector) return;
    actions.deleteConnector(editingConnector.id);
    setEditingConnectorId(null);
  }

  async function saveGroup(draft: GroupDraft) {
    if (editingGroup) {
      actions.updateGroup(editingGroup.id, draft);
      setEditingGroupId(null);
    } else if (creatingGroup) {
      actions.addGroup({
        label: draft.label,
        memberIds: draft.memberIds,
        x: creatingGroup.rect.x,
        y: creatingGroup.rect.y,
        width: creatingGroup.rect.width,
        height: creatingGroup.rect.height,
      });
      setCreatingGroup(null);
      setSelectedIds([]);
    }
  }

  async function deleteGroup() {
    if (!editingGroup) return;
    actions.deleteGroup(editingGroup.id);
    setEditingGroupId(null);
  }

  // ---- Derived ---------------------------------------------------------------

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const containedIds = useCallback(
    (box: Rect) =>
      people
        .filter((p) => {
          const r = rects.get(p.id);
          return r ? rectContains(box, r) : false;
        })
        .map((p) => p.id),
    [people, rects],
  );

  function groupFromSelection() {
    const selectedRects = selectedIds.map((id) => rects.get(id)).filter((r): r is Rect => !!r);
    const box = boundingBox(selectedRects, GROUP_PADDING);
    if (!box) return;
    setCreatingGroup({ rect: box, memberIds: selectedIds });
  }

  const linkSourceRect = linkDraft ? rects.get(linkDraft.fromId) : undefined;

  return (
    <div className="flex h-full flex-col">
      {/* Scrolls sideways rather than wrapping or clipping on a narrow screen. */}
      <header
        className={`z-30 h-14 shrink-0 items-center gap-3 overflow-x-auto border-b border-cream-300 bg-cream-50 px-4 ${
          presentation ? "hidden" : "flex"
        }`}
      >
        <div className="flex flex-1 items-center gap-2">
          <input
            className="field w-40 shrink-0 sm:w-60"
            placeholder="Filter by name, tag or link label…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filter ? (
            <span className="whitespace-nowrap text-xs text-stone-500">
              {filter.counts.people} people · {filter.counts.connectors} links
              <button
                className="ml-2 text-terracotta-600 hover:underline"
                onClick={() => setQuery("")}
              >
                Clear
              </button>
            </span>
          ) : null}
        </div>

        <PresenceBar status={status} peers={peers} participantCount={participantCount} />

        <div className="flex items-center gap-1">
          <button
            className="btn-secondary px-2 py-1"
            onClick={() => zoomButton(1 / 1.2)}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-stone-500">
            {Math.round(view.scale * 100)}%
          </span>
          <button
            className="btn-secondary px-2 py-1"
            onClick={() => zoomButton(1.2)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="btn-secondary ml-1 text-xs"
            onClick={() => setView({ x: 0, y: 0, scale: 1 })}
          >
            Reset
          </button>
        </div>

        {canEdit ? null : (
          <span
            className="whitespace-nowrap rounded border border-amber-400 bg-amber-400/15 px-2 py-1 text-xs font-medium text-stone-700"
            title="The call host controls who can edit"
          >
            View only
          </span>
        )}

        <button className="btn-secondary" onClick={() => setShowVersions(true)}>
          History
        </button>

        <ExportMenu
          caseId={caseId}
          caseTitle={caseTitle}
          captureRef={containerRef}
          // Import rewrites the board underneath the live room, so the whole
          // document has to be rebuilt from scratch.
          onImported={() => window.location.reload()}
        />

        <button
          className="btn-primary shrink-0"
          onClick={() => setCreatingPersonAt(viewportCenterWorld())}
          disabled={!canEdit}
        >
          Add person
        </button>
      </header>

      <div
        ref={containerRef}
        onPointerDown={onBackgroundPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        className="relative flex-1 touch-none overflow-hidden bg-cream-100"
        style={{
          cursor: drawMode ? "crosshair" : "default",
          backgroundImage: DOT_GRID,
          backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div
          className="absolute left-0 top-0 h-0 w-0"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "0 0",
          }}
        >
          {/* Groups sit under connectors, which sit under cards. */}
          <GroupLayer
            groups={groups}
            dimmedIds={filter?.dimmedGroups ?? null}
            activeId={activeGroupId}
            onBoxPointerDown={onGroupPointerDown}
            onResizePointerDown={onGroupResizePointerDown}
            onOpenEditor={(g) => setEditingGroupId(g.id)}
          />

          <ConnectorLayer
            connectors={connectors}
            rects={rects}
            dimmedIds={filter?.dimmedConnectors ?? null}
            selectedId={editingConnectorId}
            draft={
              linkDraft && linkSourceRect
                ? { from: linkSourceRect, x: linkDraft.x, y: linkDraft.y }
                : null
            }
            onSelect={(c: Connector) => setEditingConnectorId(c.id)}
          />

          {people.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              dragging={activeCardIds.includes(p.id)}
              selected={selectedIds.includes(p.id)}
              linkSource={linkDraft?.fromId === p.id}
              dropTarget={linkDraft?.overId === p.id}
              dimmed={filter?.dimmedPeople.has(p.id) ?? false}
              onPointerDown={(e) => onCardPointerDown(e, p)}
              onLinkPointerDown={(e) => onLinkPointerDown(e, p)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCardMenu({ person: p, x: e.clientX, y: e.clientY });
              }}
              onMeasure={onMeasure}
            />
          ))}

          <PresenceCursors peers={peers} scale={view.scale} />

          {marquee ? (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-amber-500 bg-amber-400/10"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          ) : null}

          {drawRect ? (
            <div
              className="pointer-events-none absolute rounded-lg border-2 border-terracotta-500"
              style={{
                left: drawRect.x,
                top: drawRect.y,
                width: drawRect.width,
                height: drawRect.height,
                backgroundColor: "#EFF6FF",
              }}
            />
          ) : null}
        </div>

        {presentation ? null : <DesktopNotice />}

        {!presentation && ready && people.length > 0 ? (
          <div className="absolute bottom-3 right-3 z-20 hidden sm:block">
            <Minimap
              rects={rects}
              view={view}
              containerRef={containerRef}
              onRecenter={(wx, wy) =>
                setView((v) => ({
                  ...v,
                  x: (containerRef.current?.clientWidth ?? 0) / 2 - wx * v.scale,
                  y: (containerRef.current?.clientHeight ?? 0) / 2 - wy * v.scale,
                }))
              }
            />
          </div>
        ) : null}

        {!ready ? (
          <div
            data-export-ignore="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <p className="text-sm text-stone-500">Loading board…</p>
          </div>
        ) : null}

        {ready && people.length === 0 ? (
          <div
            data-export-ignore="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="surface pointer-events-auto px-6 py-5 text-center shadow-card">
              <p className="text-sm font-medium text-stone-700">Empty board</p>
              <p className="mt-1 max-w-xs text-sm text-stone-500">
                Add your first person card. Everything you do here syncs live to anyone else
                with this case open.
              </p>
              <button
                className="btn-primary mt-4"
                onClick={() => setCreatingPersonAt(viewportCenterWorld())}
              >
                Add person
              </button>
            </div>
          </div>
        ) : null}

        {selectedIds.length > 0 ? (
          <div
            data-export-ignore="true"
            className="surface absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 px-4 py-2 shadow-panel"
          >
            <span className="text-sm text-stone-700">{selectedIds.length} selected</span>
            <button className="btn-primary px-2 py-1 text-xs" onClick={groupFromSelection}>
              Group
            </button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setSelectedIds([])}>
              Clear
            </button>
          </div>
        ) : null}

        {presentation ? null : (
          <p
            data-export-ignore="true"
            className="pointer-events-none absolute bottom-3 left-4 text-xs text-stone-400"
          >
            {drawMode
              ? "Drag a rectangle to group the cards inside it · Esc to cancel"
              : "Drag to pan · scroll to zoom · drag the ● handle to connect · shift-drag to select"}
          </p>
        )}
      </div>

      {cardMenu ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCardMenu(null)} />
          <div
            className="surface fixed z-50 w-48 py-1 shadow-panel"
            style={{ left: cardMenu.x, top: cardMenu.y }}
          >
            <button
              className="w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-cream-200"
              onClick={() => {
                setEditingPersonId(cardMenu.person.id);
                setCardMenu(null);
              }}
            >
              Edit person
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-cream-200"
              onClick={() => {
                setPickerFromId(cardMenu.person.id);
                setCardMenu(null);
              }}
            >
              Connect to…
            </button>
          </div>
        </>
      ) : null}

      {creatingPersonAt ? (
        <PersonEditor
          mode="create"
          initial={emptyDraft()}
          onSave={savePerson}
          onClose={() => setCreatingPersonAt(null)}
        />
      ) : null}

      {editingPerson ? (
        <PersonEditor
          key={editingPerson.id}
          mode="edit"
          initial={toDraft(editingPerson)}
          onSave={savePerson}
          onDelete={deletePerson}
          onClose={() => setEditingPersonId(null)}
        />
      ) : null}

      {pickerFrom ? (
        <PersonPicker
          fromName={pickerFrom.name}
          people={people.filter((p) => p.id !== pickerFrom.id)}
          onPick={(target) => {
            setCreatingConnector({ fromId: pickerFrom.id, toId: target.id });
            setPickerFromId(null);
          }}
          onClose={() => setPickerFromId(null)}
        />
      ) : null}

      {creatingConnector ? (
        <ConnectorEditor
          mode="create"
          fromName={personById.get(creatingConnector.fromId)?.name ?? "?"}
          toName={personById.get(creatingConnector.toId)?.name ?? "?"}
          initial={{ label: "", confidence: "unconfirmed", direction: "none" }}
          onSave={saveConnector}
          onClose={() => setCreatingConnector(null)}
        />
      ) : null}

      {editingConnector ? (
        <ConnectorEditor
          key={editingConnector.id}
          mode="edit"
          fromName={personById.get(editingConnector.fromId)?.name ?? "?"}
          toName={personById.get(editingConnector.toId)?.name ?? "?"}
          initial={{
            label: editingConnector.label ?? "",
            confidence: editingConnector.confidence,
            direction: editingConnector.direction,
          }}
          onSave={saveConnector}
          onDelete={deleteConnector}
          onClose={() => setEditingConnectorId(null)}
        />
      ) : null}

      {creatingGroup ? (
        <GroupEditor
          mode="create"
          initial={{ label: "", memberIds: creatingGroup.memberIds }}
          people={people}
          containedIds={containedIds(creatingGroup.rect)}
          onSave={saveGroup}
          onClose={() => setCreatingGroup(null)}
        />
      ) : null}

      {showVersions ? (
        <VersionHistory
          caseId={caseId}
          kind="board"
          canRestore={canEdit}
          onClose={() => setShowVersions(false)}
        />
      ) : null}

      {editingGroup ? (
        <GroupEditor
          key={editingGroup.id}
          mode="edit"
          initial={{ label: editingGroup.label, memberIds: editingGroup.memberIds }}
          people={people}
          containedIds={containedIds(editingGroup)}
          onSave={saveGroup}
          onDelete={deleteGroup}
          onClose={() => setEditingGroupId(null)}
        />
      ) : null}
    </div>
  );
}
