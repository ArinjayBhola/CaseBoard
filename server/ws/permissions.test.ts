import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as encoding from "lib0/encoding";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import { carriesDocumentEdit } from "./permissions";

/**
 * The view-only guard.
 *
 * Hiding UI buttons is not enforcement — a participant can call the Yjs API from
 * devtools. These build the exact frames a real client sends and assert which
 * ones are allowed through to the shared document.
 */

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

function syncStep1(doc: Y.Doc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

function syncStep2(doc: Y.Doc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep2(encoder, doc);
  return encoding.toUint8Array(encoder);
}

function updateMessage(update: Uint8Array) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

function awarenessMessage() {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, new Uint8Array([1, 2, 3]));
  return encoding.toUint8Array(encoder);
}

function docWithContent() {
  const doc = new Y.Doc();
  doc.getMap("people").set("p1", "someone");
  return doc;
}

describe("view-only guard", () => {
  it("blocks a document update", () => {
    const doc = docWithContent();
    const update = Y.encodeStateAsUpdate(doc);

    assert.equal(carriesDocumentEdit(updateMessage(update)), true);
  });

  // Step 2 carries the sender's own state. A client with an IndexedDB cache can
  // put real content in it, so it counts as a write.
  it("blocks sync step 2", () => {
    assert.equal(carriesDocumentEdit(syncStep2(docWithContent())), true);
  });

  it("allows sync step 1, which only requests state", () => {
    assert.equal(carriesDocumentEdit(syncStep1(docWithContent())), false);
  });

  // A view-only participant should still appear to everyone else.
  it("allows awareness so presence and cursors keep working", () => {
    assert.equal(carriesDocumentEdit(awarenessMessage()), false);
  });

  it("blocks malformed frames rather than guessing", () => {
    assert.equal(carriesDocumentEdit(new Uint8Array([])), true);
    assert.equal(carriesDocumentEdit(new Uint8Array([MESSAGE_SYNC])), true);
    assert.equal(carriesDocumentEdit(new Uint8Array([255, 255, 255, 255])), true);
  });

  it("blocks an update carrying a deletion, not just an insertion", () => {
    const doc = docWithContent();
    const before = Y.encodeStateVector(doc);
    doc.getMap("people").delete("p1");
    const deletion = Y.encodeStateAsUpdate(doc, before);

    assert.equal(carriesDocumentEdit(updateMessage(deletion)), true);
  });

  it("blocks every frame produced by a real editing session", () => {
    const doc = new Y.Doc();
    const frames: Uint8Array[] = [];
    doc.on("update", (update: Uint8Array) => frames.push(updateMessage(update)));

    // Roughly what dragging a card and editing its fields produces.
    for (let i = 0; i < 20; i++) {
      doc.transact(() => {
        const map = doc.getMap("people");
        const entry = (map.get("p1") as Y.Map<unknown>) ?? new Y.Map();
        if (!map.has("p1")) map.set("p1", entry);
        entry.set("x", i * 10);
      });
    }

    assert.ok(frames.length >= 20, "expected an update per transaction");
    assert.ok(
      frames.every((frame) => carriesDocumentEdit(frame)),
      "an edit frame slipped past the guard",
    );
  });
});
