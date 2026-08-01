import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redisSubscriber } from "@/lib/realtime/permissions";
import { listSessions, sessionsChannel } from "@/lib/sessions/service";

export const dynamic = "force-dynamic";

/**
 * Live server-sent stream of the user's own sessions.
 *
 * Pushed rather than polled, so a sign-in or sign-out on another device shows
 * up on an open account page within a moment. A slow re-poll runs alongside as
 * a safety net (missed event, Redis blip) and to keep "last active" fresh.
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

      const push = async () => {
        if (closed) return;
        try {
          const sessions = await listSessions(userId, currentSid);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sessions })}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Send the current list immediately so the client never waits on an event.
      await push();

      try {
        await subscriber.subscribe(sessionsChannel(userId));
        subscriber.on("message", () => void push());
      } catch {
        // Redis down: the interval below still keeps the list reasonably fresh.
      }

      // Safety-net re-poll + keeps idle proxies from dropping the connection.
      const tick = setInterval(() => void push(), 20_000);
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
        clearInterval(tick);
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
      "X-Accel-Buffering": "no",
    },
  });
}
