import Redis from "ioredis";

/**
 * Live edit permissions.
 *
 * The model is baseline ∩ call override:
 *
 *  - Outside a call, anyone with case access edits (the Phase 3 behaviour).
 *  - During a call, the host may restrict people to view-only. New joiners
 *    default to view-only and must be granted edit explicitly.
 *  - The case owner is always an editor and cannot be demoted. Otherwise a guest
 *    who started a call could lock the owner out of their own investigation.
 *
 * State lives in Redis because it is read on every single Yjs update and does
 * not need to survive a restart — when a call ends, the restrictions end too.
 */

export type { Permission } from "./entities";
import type { Permission } from "./entities";

const CALL_TTL_SECONDS = 60 * 60 * 12;

export const permissionKey = (caseId: string, userId: string) =>
  `case:${caseId}:permissions:${userId}`;
export const hostKey = (caseId: string) => `case:${caseId}:call:host`;
export const callActiveKey = (caseId: string) => `case:${caseId}:call:active`;
/** Pub/sub channel used to push changes to connected clients immediately. */
export const permissionChannel = (caseId: string) => `case:${caseId}:permissions`;

export type PermissionEvent = {
  caseId: string;
  userId: string;
  permission: Permission;
};

let client: Redis | null = null;

export function redis(): Redis {
  if (client) return client;
  client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
  });

  // Log the first failure, then stay quiet until it recovers — a Redis that is
  // down would otherwise emit an error on every reconnect attempt forever.
  let logged = false;
  client.on("error", (err) => {
    if (logged) return;
    logged = true;
    console.warn("[permissions] redis unavailable:", err.message);
  });
  client.on("ready", () => {
    logged = false;
  });

  return client;
}

/** Separate connection: a subscribed client cannot run normal commands. */
export function redisSubscriber(): Redis {
  const subscriber = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    // Back off instead of hammering a Redis that is down, and cap the delay so
    // it still recovers promptly once it returns.
    retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
  });

  // ioredis emits 'error' on every failed reconnect. Without a listener those
  // are unhandled error events, which flood the log and can take the process
  // down — the permission stream degrades, it should not crash the server.
  let logged = false;
  subscriber.on("error", (err) => {
    if (logged) return;
    logged = true;
    console.warn("[permissions] redis subscriber unavailable:", err.message);
  });
  subscriber.on("ready", () => {
    logged = false;
  });

  return subscriber;
}

export async function isCallActive(caseId: string) {
  return (await redis().exists(callActiveKey(caseId))) === 1;
}

export async function getHost(caseId: string) {
  return redis().get(hostKey(caseId));
}

/** Called when someone starts a call. First person in becomes the host. */
export async function beginCallControl(caseId: string, hostUserId: string) {
  const r = redis();
  const existing = await r.get(hostKey(caseId));
  if (!existing) {
    await r.set(hostKey(caseId), hostUserId, "EX", CALL_TTL_SECONDS);
  }
  await r.set(callActiveKey(caseId), "1", "EX", CALL_TTL_SECONDS);
  return existing ?? hostUserId;
}

/** Clears every restriction for a case. Baseline access resumes. */
export async function endCallControl(caseId: string) {
  const r = redis();
  const keys = await r.keys(permissionKey(caseId, "*"));
  const pipeline = r.pipeline();
  if (keys.length > 0) pipeline.del(...keys);
  pipeline.del(hostKey(caseId));
  pipeline.del(callActiveKey(caseId));
  await pipeline.exec();
}

export async function setPermission(
  caseId: string,
  userId: string,
  permission: Permission,
) {
  const r = redis();
  await r.set(permissionKey(caseId, userId), permission, "EX", CALL_TTL_SECONDS);
  // Push rather than poll, so a change lands inside the current session.
  await r.publish(
    permissionChannel(caseId),
    JSON.stringify({ caseId, userId, permission } satisfies PermissionEvent),
  );
}

export type ResolveInput = {
  caseId: string;
  userId: string;
  isOwner: boolean;
  /**
   * Whether this user edits at baseline. Owners and members with the "editor"
   * role do; a "viewer" does not. Defaults true so existing callers keep the
   * pre-roles behaviour. A viewer is view-only whether or not a call is running
   * — the call override can restrict an editor, never promote a viewer.
   */
  baselineEdit?: boolean;
};

/**
 * The single place permission is decided. Both the Next API and the websocket
 * server call this, so the UI and the enforcement layer can never disagree.
 *
 * Fails **closed** on a Redis outage only for non-owners during an unknown call
 * state — see `resolvePermission`'s catch.
 */
export async function resolvePermission({
  caseId,
  userId,
  isOwner,
  baselineEdit = true,
}: ResolveInput): Promise<Permission> {
  // The owner is never restricted, so their access survives a Redis outage.
  if (isOwner) return "edit";

  // A viewer's baseline is view-only. Decided before Redis is consulted, so a
  // viewer stays read-only even during a Redis outage — the safe direction.
  if (!baselineEdit) return "view";

  try {
    const r = redis();
    const [active, explicit, host] = await Promise.all([
      r.exists(callActiveKey(caseId)),
      r.get(permissionKey(caseId, userId)),
      r.get(hostKey(caseId)),
    ]);

    // No call running: baseline membership applies, which is edit access.
    if (active !== 1) return "edit";

    if (host === userId) return "edit";
    if (explicit === "edit") return "edit";
    if (explicit === "view") return "view";

    // In a call with nothing explicitly granted: view-only by default. The point
    // of the feature is controlled access, so silence means "not yet".
    return "view";
  } catch (err) {
    console.warn(
      "[permissions] resolve failed, denying edit:",
      err instanceof Error ? err.message : err,
    );
    // Redis is unreachable and we cannot tell whether a call is restricting this
    // user. Denying edits is recoverable; wrongly allowing them is not.
    return "view";
  }
}
