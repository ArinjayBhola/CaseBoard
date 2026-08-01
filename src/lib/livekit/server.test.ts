import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { decodeJwt } from "jose";

/**
 * The screen-share connection is a second LiveKit identity for the same person.
 * Its whole justification is that it cannot do anything except publish the tab
 * capture — so that restriction is asserted here rather than assumed.
 */

type Grant = {
  video?: {
    room?: string;
    roomJoin?: boolean;
    canPublish?: boolean;
    canPublishSources?: string[];
  };
  sub?: string;
};

describe("LiveKit call tokens", () => {
  let createCallToken: typeof import("./server").createCallToken;
  let callRoomName: typeof import("./server").callRoomName;

  before(async () => {
    process.env.LIVEKIT_API_KEY = "testkey";
    process.env.LIVEKIT_API_SECRET = "testsecret-testsecret-testsecret";
    const mod = await import("./server");
    createCallToken = mod.createCallToken;
    callRoomName = mod.callRoomName;
  });

  it("scopes a member token to that case's room only", async () => {
    const token = await createCallToken({
      caseId: "case-1",
      userId: "user-1",
      displayName: "alice",
      kind: "member",
    });

    const claims = decodeJwt(token) as Grant;
    assert.equal(claims.video?.room, callRoomName("case-1"));
    assert.equal(claims.video?.roomJoin, true);
    assert.equal(claims.sub, "user-1");
    assert.notEqual(claims.video?.room, callRoomName("case-2"));
  });

  it("gives the share identity a screen-share-only publish grant", async () => {
    const token = await createCallToken({
      caseId: "case-1",
      userId: "user-1",
      displayName: "alice",
      kind: "share",
    });

    const claims = decodeJwt(token) as Grant;
    const sources = claims.video?.canPublishSources ?? [];

    assert.ok(sources.length > 0, "share token had no source restriction at all");
    assert.ok(
      sources.every((s) => s.toLowerCase().includes("screen")),
      `share token could publish non-screen sources: ${sources.join(", ")}`,
    );
    assert.ok(
      !sources.some((s) => s.toLowerCase().includes("camera")),
      "share token could publish camera",
    );
    assert.ok(
      !sources.some((s) => s.toLowerCase().includes("microphone")),
      "share token could publish microphone",
    );
  });

  it("separates the share identity from the member identity", async () => {
    const member = decodeJwt(
      await createCallToken({
        caseId: "c",
        userId: "user-1",
        displayName: "alice",
        kind: "member",
      }),
    ) as Grant;
    const share = decodeJwt(
      await createCallToken({
        caseId: "c",
        userId: "user-1",
        displayName: "alice",
        kind: "share",
      }),
    ) as Grant;

    assert.equal(member.sub, "user-1");
    assert.equal(share.sub, "user-1__share");
    assert.notEqual(member.sub, share.sub);
  });

  it("leaves member tokens unrestricted so camera and mic still work", async () => {
    const claims = decodeJwt(
      await createCallToken({
        caseId: "c",
        userId: "user-1",
        displayName: "alice",
        kind: "member",
      }),
    ) as Grant;

    assert.equal(claims.video?.canPublish, true);
    assert.equal(
      claims.video?.canPublishSources,
      undefined,
      "member token was unexpectedly source-restricted",
    );
  });
});
