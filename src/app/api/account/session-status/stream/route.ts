import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redisSubscriber } from "@/lib/realtime/permissions";
import { sessionsChannel } from "@/lib/sessions/service";

export const dynamic = "force-dynamic";

/**
 * Tiny live signal for one thing: has *this* session been revoked?
 *
 * Every authenticated page keeps this open (via <SessionGuard>). The instant the
 * backing UserSession row is deleted — a sign-out from another device, or a
 * password change elsewhere — this emits `{revoked:true}` and the browser signs
 * itself out. That is what makes a remote sign-out immediate even for an idle
 * tab: without a push, nothing would tell that tab to leave.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const currentSid = session?.sessionId ?? null;
  if (!userId) return new Response("Unauthorized", { status: 401 });

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

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(tick);
        clearInterval(heartbeat);
        void subscriber.quit();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      // A cookie minted before session tracking has no sid — nothing to revoke
      // against, so just hold the connection open harmlessly.
      const check = async () => {
        if (closed || !currentSid) return;
        try {
          const row = await prisma.userSession.findUnique({
            where: { id: currentSid },
            select: { id: true },
          });
          if (!row) {
            send({ revoked: true });
            close();
          }
        } catch {
          // A DB hiccup shouldn't sign anyone out — wait for the next tick.
        }
      };

      // Re-check on every change event for this user, and on a slow timer as a
      // backstop when Redis can't deliver the event.
      try {
        await subscriber.subscribe(sessionsChannel(userId));
        subscriber.on("message", () => void check());
      } catch {
        // Redis down: the interval below still catches a revocation within ~10s.
      }

      const tick = setInterval(() => void check(), 10_000);
      const heartbeat = setInterval(() => send({ ok: true }), 25_000);

      req.signal.addEventListener("abort", close);

      // Confirm liveness once up front, and run an immediate check in case the
      // row was already gone before the stream opened.
      send({ ok: true });
      await check();
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
      "X-Accel-Buffering": "no",
    },
  });
}
