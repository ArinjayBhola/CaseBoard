import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePermission } from "./permissions";

/**
 * The owner and a baseline viewer both resolve *before* Redis is consulted, so
 * these assertions hold with no Redis running — which is also the guarantee that
 * matters operationally: a viewer stays read-only and an owner keeps editing
 * even during a Redis outage.
 */

test("the owner always resolves to edit", async () => {
  const permission = await resolvePermission({
    caseId: "case1",
    userId: "owner",
    isOwner: true,
    // Even with baselineEdit forced false, ownership wins.
    baselineEdit: false,
  });
  assert.equal(permission, "edit");
});

test("a baseline viewer is view-only regardless of call state", async () => {
  const permission = await resolvePermission({
    caseId: "case1",
    userId: "guest",
    isOwner: false,
    baselineEdit: false,
  });
  assert.equal(permission, "view");
});
