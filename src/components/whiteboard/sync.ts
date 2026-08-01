import type * as Y from "yjs";

/**
 * Whiteboard sync core.
 *
 * Kept free of React and of Excalidraw itself so it can be reasoned about and
 * tested directly: the merge function is injected, and everything else here is
 * bookkeeping over a Y.Map.
 */

export type ElementLike = {
  id: string;
  version: number;
  versionNonce: number;
  /** Excalidraw's fractional index — a string whose sort order is z-order. */
  index?: string | null;
  isDeleted?: boolean;
};

export type Reconciler<T extends ElementLike, S> = (
  local: readonly T[],
  remote: readonly T[],
  appState: S,
) => T[];

type Version = { version: number; versionNonce: number };

const sameVersion = (a: Version | undefined, b: Version) =>
  !!a && a.version === b.version && a.versionNonce === b.versionNonce;

/** Marks a Yjs transaction as locally originated. */
export const LOCAL_ORIGIN = "local";

export class WhiteboardSync<T extends ElementLike, S> {
  /**
   * Version last seen for each element in either direction. This is what stops
   * an applied remote update from being pushed straight back out.
   */
  private readonly shadow = new Map<string, Version>();
  private lastPushedHash: number | null = null;

  constructor(
    private readonly doc: Y.Doc,
    private readonly map: Y.Map<Record<string, unknown>>,
    private readonly reconcile: Reconciler<T, S>,
    private readonly hash: (elements: readonly T[]) => number,
  ) {}

  /** Remote elements, in z-order. */
  remoteElements(): T[] {
    const out: T[] = [];
    this.map.forEach((raw) => {
      const el = raw as unknown as T;
      if (el?.id) out.push(el);
    });

    // Y.Map iteration is insertion order, not z-order. Sorting by the fractional
    // index reproduces the same stacking order on every client.
    out.sort((a, b) => {
      const ai = a.index ?? "";
      const bi = b.index ?? "";
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });
    return out;
  }

  /**
   * Publishes local edits.
   *
   * Deletion is never inferred from an element's absence: Excalidraw signals it
   * with an `isDeleted` tombstone and purges the element later on its own
   * schedule. Treating absence as deletion races that purge and can resurrect
   * shapes on peers.
   */
  push(local: readonly T[]): void {
    const hash = this.hash(local);
    // Excalidraw fires onChange for pure app-state changes (selection, tool,
    // viewport) that carry no element edits at all.
    if (hash === this.lastPushedHash) return;
    this.lastPushedHash = hash;

    this.doc.transact(() => {
      for (const el of local) {
        if (sameVersion(this.shadow.get(el.id), el)) continue;
        this.shadow.set(el.id, { version: el.version, versionNonce: el.versionNonce });
        this.map.set(el.id, el as unknown as Record<string, unknown>);
      }
    }, LOCAL_ORIGIN);
  }

  /**
   * Merges remote state into the local scene and returns what should be applied,
   * or null when there is nothing to do.
   *
   * `appState` is handed to the reconciler so elements the user is actively
   * dragging or editing survive an incoming update. Replacing the scene with
   * remote state alone would discard any stroke made since the last push.
   */
  pull(local: readonly T[], appState: S): T[] | null {
    const remote = this.remoteElements();
    if (remote.length === 0) return null;

    const reconciled = this.reconcile(local, remote, appState);

    // Record only the elements where the remote copy won. Where the local copy
    // won, the shadow deliberately stays stale so the next push publishes our
    // newer version rather than silently dropping it.
    const remoteById = new Map(remote.map((el) => [el.id, el]));
    for (const el of reconciled) {
      const r = remoteById.get(el.id);
      if (r && sameVersion(r, el)) {
        this.shadow.set(el.id, { version: el.version, versionNonce: el.versionNonce });
      }
    }

    return reconciled;
  }

  /** Test/diagnostic hook. */
  shadowSize(): number {
    return this.shadow.size;
  }
}

/**
 * Excalidraw's merge rule, used as a fallback and to document the contract the
 * injected reconciler is expected to follow: higher `version` wins, ties broken
 * by the lower `versionNonce` so every client picks the same side.
 */
export function pickWinner<T extends ElementLike>(a: T, b: T): T {
  if (a.version > b.version) return a;
  if (b.version > a.version) return b;
  return a.versionNonce <= b.versionNonce ? a : b;
}
