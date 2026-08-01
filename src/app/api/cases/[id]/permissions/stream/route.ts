import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  permissionChannel,
  redisSubscriber,
  resolvePermission,
  type PermissionEvent,
} from "@/lib/realtime/permissions";
import { assertCaseAccess, baselineEditAllowed } from "@/server/services/cases";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

/**
 * Server-sent stream of this user's own permission.
 *
 * Polling would make a host's change land up to an interval late; the spec calls
 * for it to take effect within the same session, so changes are pushed. The
 * websocket server enforces independently — this stream only keeps the UI honest.
 */
export async function GET(req: Request, { params }: Params) {
  const userId = await currentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const caseId = params.id;

  try {
    await assertCaseAccess(userId, caseId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const record = await prisma.case.findUnique({
    where: { id: caseId },
    select: { ownerId: true },
  });
  const isOwner = record?.ownerId === userId;

  const subscriber = redisSubscriber();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const push = async () => {
        // Re-read the baseline each push: a "*" event may be a member-role change,
        // and this stream must reflect it without a reconnect. Cheap — pushes only
        // happen on call/permission/role events, not per frame.
        const baselineEdit = await baselineEditAllowed(caseId, userId, isOwner);
        send({ permission: await resolvePermission({ caseId, userId, isOwner, baselineEdit }) });
      };

      // Send the current value straight away so the client never renders on a guess.
      await push();

      await subscriber.subscribe(permissionChannel(caseId));
      subscriber.on("message", (_channel, payload) => {
        try {
          const event = JSON.parse(payload) as PermissionEvent;
          // "*" means the call state changed wholesale (started or ended).
          if (event.userId !== userId && event.userId !== "*") return;
          void push();
        } catch {
          // Ignore malformed events rather than tearing down the stream.
        }
      });

      // Keeps proxies from closing an idle connection.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        void subscriber.quit();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },

    cancel() {
      void subscriber.quit();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx and friends buffer SSE into uselessness without this.
      "X-Accel-Buffering": "no",
    },
  });
}
