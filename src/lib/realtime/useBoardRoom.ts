"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import {
  connectorsMap,
  groupsMap,
  patchEntity,
  peopleMap,
  readBoard,
  writeConnector,
  writeGroup,
  writePerson,
} from "./boardDoc";
import type { BoardData, Connector, Group, Person } from "./entities";
import type { Permission } from "./entities";
import { useYRoom, type Room } from "./useYRoom";

export type BoardActions = {
  addPerson: (fields: Omit<Person, "id">) => string;
  updatePerson: (id: string, patch: Partial<Omit<Person, "id">>) => void;
  /** One transaction for a whole drag, so peers see the group move atomically. */
  movePeople: (moves: { id: string; x: number; y: number }[]) => void;
  deletePerson: (id: string) => void;

  addConnector: (fields: Omit<Connector, "id">) => string;
  updateConnector: (id: string, patch: Partial<Omit<Connector, "id">>) => void;
  deleteConnector: (id: string) => void;

  addGroup: (fields: Omit<Group, "id">) => string;
  updateGroup: (id: string, patch: Partial<Omit<Group, "id">>) => void;
  moveGroup: (
    id: string,
    box: { x: number; y: number; width: number; height: number },
    memberMoves: { id: string; x: number; y: number }[],
  ) => void;
  deleteGroup: (id: string) => void;
};

export type BoardRoom = Room & {
  board: BoardData;
  actions: BoardActions;
  /** False when this user may not edit. UI should render read-only. */
  canEdit: boolean;
  /** Undo/redo the local user's own board edits. No-ops while view-only. */
  undo: () => void;
  redo: () => void;
};

/**
 * Origin tag on every mutation this app makes. Lets the read-only guard tell our
 * own writes apart from updates arriving from peers.
 */
export const LOCAL_EDIT_ORIGIN = "local-edit";

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const EMPTY: BoardData = { people: [], connectors: [], groups: [] };

/**
 * The Yjs document is the source of truth on the client. React state is a
 * read-only mirror rebuilt on every doc update, local or remote — there is no
 * separate optimistic path that could drift from what peers see.
 */
export function useBoardRoom(caseId: string, permission: Permission = "edit"): BoardRoom {
  const room = useYRoom(caseId, "board");
  const { doc } = room;
  const canEdit = permission === "edit";

  const [board, setBoard] = useState<BoardData>(EMPTY);

  useEffect(() => {
    const sync = () => setBoard(readBoard(doc));
    sync();
    doc.on("update", sync);
    return () => {
      doc.off("update", sync);
    };
  }, [doc]);

  /**
   * Read-only enforcement, client side.
   *
   * The websocket server already refuses to apply edits from a view-only client,
   * so a bypass never reaches other people. But the local document would still
   * diverge, showing this user a board nobody else can see. An UndoManager
   * watching locally-originated transactions rolls those back.
   *
   * `null` is tracked deliberately: a transaction run straight from devtools has
   * no origin, and that is precisely the case this guards against.
   */
  useEffect(() => {
    if (canEdit) return;

    const undoManager = new Y.UndoManager(
      [peopleMap(doc), connectorsMap(doc), groupsMap(doc)],
      {
        trackedOrigins: new Set([null, LOCAL_EDIT_ORIGIN]),
        // Each transaction becomes its own undo entry; the default groups
        // nearby edits and would revert more than the offending one.
        captureTimeout: 0,
      },
    );

    const onAfterTransaction = (transaction: Y.Transaction) => {
      if (!transaction.local) return;
      if (undoManager.undoStack.length === 0) return;
      // Deferred: undoing inside afterTransaction re-enters the same code path.
      queueMicrotask(() => undoManager.undo());
    };

    doc.on("afterTransaction", onAfterTransaction);
    return () => {
      doc.off("afterTransaction", onAfterTransaction);
      undoManager.destroy();
    };
  }, [canEdit, doc]);

  /**
   * Undo stack for this user's own edits. Tracks only LOCAL_EDIT_ORIGIN
   * transactions, so undo reverts what you did without clobbering a peer's
   * concurrent change. Rebuilt when edit rights change; a view-only user has none.
   */
  const undoRef = useRef<Y.UndoManager | null>(null);
  useEffect(() => {
    if (!canEdit) {
      undoRef.current = null;
      return;
    }
    const manager = new Y.UndoManager(
      [peopleMap(doc), connectorsMap(doc), groupsMap(doc)],
      { trackedOrigins: new Set([LOCAL_EDIT_ORIGIN]) },
    );
    undoRef.current = manager;
    return () => {
      manager.destroy();
      undoRef.current = null;
    };
  }, [canEdit, doc]);

  const undo = useCallback(() => undoRef.current?.undo(), []);
  const redo = useCallback(() => undoRef.current?.redo(), []);

  const actions = useMemo<BoardActions>(() => {
    const people = () => peopleMap(doc);
    const connectors = () => connectorsMap(doc);
    const groups = () => groupsMap(doc);

    // Every mutation runs through here, so read-only is enforced in one place
    // rather than at a dozen call sites.
    const write = (fn: () => void) => {
      if (!canEdit) return;
      doc.transact(fn, LOCAL_EDIT_ORIGIN);
    };

    return {
      addPerson(fields) {
        const id = newId();
        write(() => writePerson(doc, { id, ...fields }));
        return id;
      },

      updatePerson(id, patch) {
        write(() => patchEntity(people(), id, patch));
      },

      movePeople(moves) {
        write(() => {
          for (const move of moves) {
            patchEntity(people(), move.id, { x: move.x, y: move.y });
          }
        });
      },

      deletePerson(id) {
        write(() => {
          people().delete(id);

          // Connectors have no referential integrity inside Yjs — drop any that
          // pointed at this person, or peers would render dangling lines.
          const dead: string[] = [];
          connectors().forEach((entity, connectorId) => {
            if (entity.get("fromId") === id || entity.get("toId") === id) {
              dead.push(connectorId);
            }
          });
          for (const connectorId of dead) connectors().delete(connectorId);

          groups().forEach((entity) => {
            const members = entity.get("memberIds");
            if (Array.isArray(members) && members.includes(id)) {
              entity.set(
                "memberIds",
                members.filter((m) => m !== id),
              );
            }
          });
        });
      },

      addConnector(fields) {
        const id = newId();
        write(() => writeConnector(doc, { id, ...fields }));
        return id;
      },

      updateConnector(id, patch) {
        write(() => patchEntity(connectors(), id, patch));
      },

      deleteConnector(id) {
        write(() => connectors().delete(id));
      },

      addGroup(fields) {
        const id = newId();
        write(() => writeGroup(doc, { id, ...fields }));
        return id;
      },

      updateGroup(id, patch) {
        write(() => patchEntity(groups(), id, patch));
      },

      moveGroup(id, box, memberMoves) {
        write(() => {
          patchEntity(groups(), id, box);
          for (const move of memberMoves) {
            patchEntity(people(), move.id, { x: move.x, y: move.y });
          }
        });
      },

      deleteGroup(id) {
        write(() => groups().delete(id));
      },
    };
  }, [canEdit, doc]);

  const setCursor = useCallback(room.setCursor, [room.setCursor]);

  return { ...room, setCursor, board, actions, canEdit, undo, redo };
}
