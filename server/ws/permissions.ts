import * as decoding from "lib0/decoding";
import type { WebSocket } from "ws";
import {
  permissionChannel,
  redisSubscriber,
  resolvePermission,
  type Permission,
  type PermissionEvent,
} from "../../src/lib/realtime/permissions";
import { asMemberRole } from "../../src/lib/realtime/entities";
import { prisma } from "./prisma";

/**
 * Server-side edit enforcement.
 *
 * Hiding buttons in the UI is not enforcement — a view-only participant can open
 * devtools and call the Yjs API directly. So permission is checked here, on the
 * socket, before any update is allowed to reach the shared document.
 */

// y-websocket top-level message types.
const MESSAGE_SYNC = 0;
// y-protocols sync sub-types.
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

/**
 * True when a frame would change the document.
 *
 * Sync step 1 is a read request and stays allowed, as does awareness (presence
 * and cursors) — a view-only participant should still be visible to others.
 * Step 2 carries the client's own state, which for a client with an IndexedDB
 * cache can contain real content, so it is treated as a write.
 */
export function carriesDocumentEdit(data: Uint8Array): boolean {
  try {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);
    if (messageType !== MESSAGE_SYNC) return false;

    const syncType = decoding.readVarUint(decoder);
    return syncType === SYNC_STEP_2 || syncType === SYNC_UPDATE;
  } catch {
    // Unparseable frame: refuse it rather than guess. A malformed message is
    // exactly what an attempt to slip past this check would look like.
    return true;
  }
}

// ---- Live permission cache --------------------------------------------------

type Key = string;
const keyFor = (caseId: string, userId: string): Key => `${caseId}:${userId}`;

const cache = new Map<Key, Permission>();
/** Owner flags, so a cache refresh can re-resolve without hitting Postgres. */
const owners = new Map<Key, boolean>();

export function currentPermission(caseId: string, userId: string): Permission {
  // Absent means "not established yet" — deny rather than assume.
  return cache.get(keyFor(caseId, userId)) ?? "view";
}

/**
 * Baseline edit right, read straight from Postgres. The owner always edits; a
 * member edits unless their role is "viewer". Re-read on every load so a role
 * change picked up by `refreshCase` takes effect without a reconnect.
 */
async function baselineEdit(caseId: string, userId: string, isOwner: boolean): Promise<boolean> {
  if (isOwner) return true;
  try {
    const member = await prisma.caseMember.findUnique({
      where: { caseId_userId: { caseId, userId } },
      select: { role: true },
    });
    if (!member) return false;
    return asMemberRole(member.role) !== "viewer";
  } catch (err) {
    // A database blip should not silently grant edit to a viewer. Deny — the
    // client is denied edit, which is recoverable, and a reconnect re-resolves.
    console.warn(
      "[ws] baseline role lookup failed, denying edit:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

export async function loadPermission(caseId: string, userId: string, isOwner: boolean) {
  const allowed = await baselineEdit(caseId, userId, isOwner);
  const permission = await resolvePermission({ caseId, userId, isOwner, baselineEdit: allowed });
  cache.set(keyFor(caseId, userId), permission);
  owners.set(keyFor(caseId, userId), isOwner);
  return permission;
}

export function forgetPermission(caseId: string, userId: string) {
  cache.delete(keyFor(caseId, userId));
  owners.delete(keyFor(caseId, userId));
}

/**
 * Applies permission changes the moment the host makes them, rather than on the
 * next reconnect.
 *
 * A userId of "*" means the call's state changed wholesale (started or ended),
 * so every cached entry for that case is re-resolved.
 */
export function subscribeToPermissionChanges() {
  const subscriber = redisSubscriber();

  subscriber.psubscribe("case:*:permissions", (err) => {
    if (err) console.error("[ws] permission subscribe failed:", err.message);
    else console.log("[ws] watching permission changes");
  });

  subscriber.on("pmessage", (_pattern, channel, payload) => {
    try {
      const event = JSON.parse(payload) as PermissionEvent;

      if (event.userId === "*") {
        void refreshCase(event.caseId);
        return;
      }

      const key = keyFor(event.caseId, event.userId);
      // The owner is never restricted, whatever the event says.
      if (owners.get(key)) return;
      // Re-resolve rather than trusting the event's permission verbatim: a host
      // grant must never lift a baseline viewer above view-only. loadPermission
      // re-reads the role and applies the ceiling.
      if (cache.has(key)) {
        void loadPermission(event.caseId, event.userId, owners.get(key) ?? false);
      }
    } catch {
      console.warn("[ws] bad permission event on", channel);
    }
  });

  return subscriber;
}

async function refreshCase(caseId: string) {
  const prefix = `${caseId}:`;
  const affected = [...cache.keys()].filter((k) => k.startsWith(prefix));

  await Promise.all(
    affected.map(async (key) => {
      const userId = key.slice(prefix.length);
      await loadPermission(caseId, userId, owners.get(key) ?? false);
    }),
  );
}

// ---- Socket guard -----------------------------------------------------------

/**
 * Wraps a socket so document-changing frames from a view-only client are dropped
 * before y-websocket's own handler ever sees them.
 *
 * Implemented as a proxy over `on('message')` rather than by patching
 * y-websocket: the library attaches its listener inside `setupWSConnection`, and
 * an EventEmitter gives no way to stop propagation once it has.
 *
 * The check is deliberately re-read per frame, so a permission change takes
 * effect on the very next message rather than on reconnect.
 */
export function guardSocket(
  socket: WebSocket,
  caseId: string,
  userId: string,
  onRejected?: () => void,
): WebSocket {
  return new Proxy(socket, {
    get(target, prop, receiver) {
      if (prop === "on" || prop === "addListener") {
        return (event: string, handler: (...args: unknown[]) => void) => {
          if (event !== "message") {
            return (target as unknown as Record<string, Function>)[prop as string].call(
              target,
              event,
              handler,
            );
          }

          return target.on("message", (data: ArrayBuffer) => {
            const bytes = new Uint8Array(data);

            if (currentPermission(caseId, userId) === "view" && carriesDocumentEdit(bytes)) {
              onRejected?.();
              return; // dropped: never reaches the shared document
            }

            handler(data);
          });
        };
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },

    set(target, prop, value) {
      return Reflect.set(target, prop, value);
    },
  }) as WebSocket;
}
