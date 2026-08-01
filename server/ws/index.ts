// This process is started separately from Next, so it loads .env itself.
import "dotenv/config";
import http from "node:http";
import { WebSocketServer } from "ws";
import { setPersistence, setupWSConnection } from "y-websocket/bin/utils";
import { parseRoom, verifyRealtimeToken } from "../../src/lib/realtime/token";
import { ensureRoomLoaded, resetRoom, startPersistenceLoop, writeState } from "./persistence";
import {
  forgetPermission,
  guardSocket,
  loadPermission,
  subscribeToPermissionChanges,
} from "./permissions";
import { restoreIntoLiveRoom, startVersionLoop } from "./versions";

const PORT = Number(process.env.WS_PORT ?? 1234);

/**
 * Realtime sync server for CaseBoard.
 *
 * Runs as its own process on its own port so it can be moved to a separate
 * container later without touching the Next app — only NEXT_PUBLIC_WS_URL
 * changes. It talks to the same Postgres database.
 *
 * Auth: the browser cannot send the NextAuth cookie here (different origin), so
 * the Next app mints a short-lived signed token after checking case membership,
 * and this server verifies the signature and that the token's caseId matches the
 * room being joined.
 */

// Hydration is done explicitly before setupWSConnection, so bindState is a no-op.
setPersistence({
  bindState: () => {},
  writeState,
  provider: null,
});

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const internalSecretOk =
    !!process.env.WS_INTERNAL_SECRET &&
    req.headers["x-internal-secret"] === process.env.WS_INTERNAL_SECRET;

  // Internal hook: the Next app calls this after a JSON import rewrites the
  // relational tables, so any live room reloads instead of overwriting them.
  if (req.method === "POST" && req.url?.startsWith("/internal/reset-room")) {
    if (!internalSecretOk) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    const room = new URL(req.url, "http://localhost").searchParams.get("room");
    if (!room) {
      res.writeHead(400).end("Missing room");
      return;
    }

    resetRoom(room);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, room }));
    return;
  }

  /**
   * Restores a version into a live room. Access is checked by the Next app
   * before it calls this; the shared secret is what stops anyone else calling it.
   */
  if (req.method === "POST" && req.url?.startsWith("/internal/restore")) {
    if (!internalSecretOk) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    const room = new URL(req.url, "http://localhost").searchParams.get("room");
    if (!room) {
      res.writeHead(400).end("Missing room");
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const applied = restoreIntoLiveRoom(room, Buffer.concat(chunks));
        res.writeHead(200, { "Content-Type": "application/json" });
        // `applied: false` means nobody is connected, so the caller persists the
        // version to Postgres instead and the next reader hydrates from it.
        res.end(JSON.stringify({ ok: true, applied }));
      } catch (err) {
        console.error("[ws] restore failed:", err);
        res.writeHead(500).end("Restore failed");
      }
    });
    return;
  }

  res.writeHead(404).end("Not found");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  void (async () => {
    const reject = (code: number, reason: string) => {
      socket.write(`HTTP/1.1 ${code} ${reason}\r\n\r\n`);
      socket.destroy();
    };

    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      // y-websocket puts the room in the path: ws://host/<room>?token=...
      const room = decodeURIComponent(url.pathname.slice(1));
      const token = url.searchParams.get("token");

      const parsed = parseRoom(room);
      if (!parsed) return reject(400, "Bad Request");
      if (!token) return reject(401, "Unauthorized");

      const claims = await verifyRealtimeToken(token);

      // The token is scoped to one case. Without this check any valid token
      // would open any room on the server.
      if (claims.caseId !== parsed.caseId) return reject(403, "Forbidden");

      // Must complete before setupWSConnection: it sends sync step 1 immediately
      // and does not wait for the persistence layer.
      await ensureRoomLoaded(room);

      // Establish this connection's edit permission before any frame can arrive.
      const permission = await loadPermission(parsed.caseId, claims.userId, claims.isOwner);

      wss.handleUpgrade(req, socket, head, (ws) => {
        let rejected = 0;
        const guarded = guardSocket(ws, parsed.caseId, claims.userId, () => {
          // Log the first attempt per connection only — a view-only client that
          // keeps trying would otherwise flood the log.
          if (rejected++ === 0) {
            console.log(
              `[ws] rejected edit from view-only ${claims.name} on ${room}`,
            );
          }
        });

        ws.on("close", () => forgetPermission(parsed.caseId, claims.userId));

        console.log(`[ws] ${claims.name} joined ${room} (${permission})`);
        setupWSConnection(guarded, req, { docName: room, gc: true });
      });
    } catch (err) {
      console.error("[ws] upgrade rejected:", err instanceof Error ? err.message : err);
      reject(401, "Unauthorized");
    }
  })();
});

startPersistenceLoop();
startVersionLoop();
subscribeToPermissionChanges();

server.listen(PORT, () => {
  console.log(`[ws] CaseBoard realtime server listening on :${PORT}`);
});

// Give in-flight snapshots a chance to land before the process exits.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[ws] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
