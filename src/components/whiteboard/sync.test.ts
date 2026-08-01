import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Y from "yjs";
import { LOCAL_ORIGIN, pickWinner, WhiteboardSync, type ElementLike } from "./sync";

/**
 * Tests for the whiteboard merge bookkeeping.
 *
 * Excalidraw itself can't be imported here — it touches `window` at module
 * scope — so `reconcile` is a stand-in implementing the same documented
 * contract: higher `version` wins, ties broken by lower `versionNonce`, and an
 * element the user is actively editing is never replaced. What's under test is
 * the surrounding bookkeeping (shadow map, echo suppression, ordering,
 * tombstones), which is the part this project owns.
 */

type El = ElementLike & { text?: string };

type AppState = { editingElementId: string | null };

const el = (
  id: string,
  version: number,
  versionNonce = 1,
  extra: Partial<El> = {},
): El => ({ id, version, versionNonce, index: `a${id}`, ...extra });

const byIndex = (a: El, b: El) => ((a.index ?? "") < (b.index ?? "") ? -1 : 1);

const reconcile = (local: readonly El[], remote: readonly El[], appState: AppState): El[] => {
  const merged = new Map<string, El>();
  for (const e of local) merged.set(e.id, e);

  for (const r of remote) {
    const l = merged.get(r.id);
    if (!l) {
      merged.set(r.id, r);
      continue;
    }
    // Excalidraw protects the element under the user's cursor.
    if (appState.editingElementId === r.id) continue;
    merged.set(r.id, pickWinner(l, r));
  }

  return [...merged.values()].sort(byIndex);
};

const hash = (elements: readonly El[]) =>
  elements.reduce((acc, e) => (acc * 31 + e.version * 7 + e.versionNonce) | 0, 17);

/** One participant: a Y.Doc, a local scene, and the sync core between them. */
class Client {
  readonly doc = new Y.Doc();
  readonly map = this.doc.getMap<Record<string, unknown>>("elements");
  readonly sync = new WhiteboardSync<El, AppState>(this.doc, this.map, reconcile, hash);
  scene: El[] = [];
  appState: AppState = { editingElementId: null };
  localUpdates = 0;

  constructor() {
    this.doc.on("update", (_u: Uint8Array, origin: unknown) => {
      if (origin === LOCAL_ORIGIN) this.localUpdates++;
    });
  }

  push() {
    this.sync.push(this.scene);
  }

  pull() {
    const next = this.sync.pull(this.scene, this.appState);
    if (next) this.scene = next;
  }

  ids() {
    return this.scene.map((e) => e.id).sort();
  }

  find(id: string) {
    return this.scene.find((e) => e.id === id);
  }
}

/** Wires two clients together, pulling on each remote update like the app does. */
function connect(a: Client, b: Client) {
  const link = (from: Client, to: Client) => {
    from.doc.on("update", (update: Uint8Array, origin: unknown) => {
      // Don't bounce a relayed update straight back.
      if (origin === "remote") return;
      Y.applyUpdate(to.doc, update, "remote");
      to.pull();
    });
  };
  link(a, b);
  link(b, a);
}

describe("WhiteboardSync", () => {
  it("propagates a new element to the peer", () => {
    const a = new Client();
    const b = new Client();
    connect(a, b);

    a.scene = [el("e1", 1)];
    a.push();

    assert.deepEqual(b.ids(), ["e1"]);
  });

  it("converges when both sides add different elements", () => {
    const a = new Client();
    const b = new Client();
    connect(a, b);

    a.scene = [el("e1", 1)];
    a.push();
    b.scene = [...b.scene, el("e2", 1)];
    b.push();

    assert.deepEqual(a.ids(), ["e1", "e2"]);
    assert.deepEqual(b.ids(), ["e1", "e2"]);
  });

  it("picks the same winner on both sides when the same element is edited concurrently", () => {
    const a = new Client();
    const b = new Client();

    // Both start from the same element, then diverge before syncing.
    a.scene = [el("e1", 1)];
    a.push();
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc), "remote");
    b.pull();

    a.scene = [el("e1", 2, 500, { text: "from A" })];
    b.scene = [el("e1", 2, 100, { text: "from B" })];

    connect(a, b);
    a.push();
    b.push();

    // Lower versionNonce wins the tie, deterministically, on both sides.
    assert.equal(a.find("e1")?.text, "from B");
    assert.equal(b.find("e1")?.text, "from B");
  });

  // The regression this whole rewrite exists for: the previous implementation
  // replaced the scene with remote state alone, so anything drawn since the last
  // push was silently destroyed by an incoming update.
  it("keeps un-pushed local elements when a remote update arrives", () => {
    const a = new Client();
    const b = new Client();
    connect(a, b);

    a.scene = [el("e1", 1)];
    a.push();

    // B starts drawing something that hasn't been published yet.
    b.scene = [...b.scene, el("draft", 1)];

    // A edits meanwhile, which pushes an update at B.
    a.scene = [el("e1", 2)];
    a.push();

    assert.ok(b.find("draft"), "in-progress local element was destroyed by a remote update");
    assert.deepEqual(b.ids(), ["draft", "e1"]);
  });

  it("does not overwrite the element the user is actively editing", () => {
    const a = new Client();
    const b = new Client();

    a.scene = [el("e1", 1)];
    a.push();
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc), "remote");
    b.pull();

    connect(a, b);

    b.appState.editingElementId = "e1";
    b.scene = [el("e1", 2, 1, { text: "B is dragging this" })];

    a.scene = [el("e1", 9, 1, { text: "A wins on version" })];
    a.push();

    assert.equal(b.find("e1")?.text, "B is dragging this");
  });

  it("stops echoing: applying a remote update produces no local writes", () => {
    const a = new Client();
    const b = new Client();
    connect(a, b);

    a.scene = [el("e1", 1), el("e2", 1)];
    a.push();

    const before = b.localUpdates;
    // Whatever B does next, re-pushing state it just received must be a no-op.
    b.push();
    b.push();

    assert.equal(b.localUpdates, before, "peer echoed remote state back onto the wire");
  });

  it("skips pushes that carry no element changes", () => {
    const a = new Client();
    a.scene = [el("e1", 1)];
    a.push();

    const after = a.localUpdates;
    a.push();
    a.push();

    assert.equal(a.localUpdates, after, "unchanged scene still produced a write");
  });

  it("propagates deletion as a tombstone", () => {
    const a = new Client();
    const b = new Client();
    connect(a, b);

    a.scene = [el("e1", 1)];
    a.push();

    a.scene = [el("e1", 2, 1, { isDeleted: true })];
    a.push();

    assert.equal(b.find("e1")?.isDeleted, true);
  });

  // Excalidraw purges tombstones locally on its own schedule. If absence were
  // treated as deletion, that purge would race the peer and could resurrect or
  // drop shapes.
  it("does not resurrect an element once the tombstone is purged locally", () => {
    const a = new Client();
    const b = new Client();
    connect(a, b);

    a.scene = [el("e1", 1), el("e2", 1)];
    a.push();

    a.scene = [el("e1", 2, 1, { isDeleted: true }), el("e2", 1)];
    a.push();

    // Excalidraw drops the tombstone from its scene later on.
    a.scene = [el("e2", 1)];
    a.push();

    assert.equal(b.find("e1")?.isDeleted, true, "deletion was lost when the tombstone was purged");
    assert.ok(b.find("e2"), "unrelated element was dropped");
  });

  it("returns remote elements in z-order regardless of Y.Map insertion order", () => {
    const a = new Client();

    // Insert deliberately out of stacking order.
    a.scene = [
      { id: "top", version: 1, versionNonce: 1, index: "a3" },
      { id: "bottom", version: 1, versionNonce: 1, index: "a1" },
      { id: "middle", version: 1, versionNonce: 1, index: "a2" },
    ];
    a.push();

    const ordered = a.sync.remoteElements().map((e) => e.id);
    assert.deepEqual(ordered, ["bottom", "middle", "top"]);
  });

  it("converges after many rapid interleaved edits from both sides", () => {
    const a = new Client();
    const b = new Client();
    connect(a, b);

    for (let i = 0; i < 30; i++) {
      a.scene = [...a.scene.filter((e) => e.id !== `a${i}`), el(`a${i}`, 1, i)];
      a.push();
      b.scene = [...b.scene.filter((e) => e.id !== `b${i}`), el(`b${i}`, 1, i)];
      b.push();
    }

    assert.equal(a.ids().length, 60);
    assert.deepEqual(a.ids(), b.ids());
  });
});
