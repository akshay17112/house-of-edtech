/**
 * Realtime sync server (apps/sync).
 *
 * A WebSocket per open document. Before a socket is accepted we prove two
 * things, in order:
 *   1. IDENTITY  — the `?token` query param is a valid sync token (signed by the
 *                  web app with the shared AUTH_SECRET) → gives us a userId.
 *   2. ACCESS    — that user has a membership on the requested document → gives
 *                  us their role. No membership ⇒ the handshake is rejected, so
 *                  a non-member can't even open the socket.
 * The role is then handed to the connection, where `viewer` is enforced as
 * read-only (see connection.ts).
 *
 * Deploys as a standalone Node service (Railway/Render). Needs AUTH_SECRET and
 * DATABASE_URL in the environment — the same values the web app uses.
 */
import { config } from "dotenv";
// Local dev reads apps/sync/.env.local; in production the platform sets real
// env vars and these files are simply absent (config() no-ops).
config({ path: ".env.local" });
config();
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { verifySyncToken } from "@repo/shared";
import { getDocumentForUser, type Role } from "@repo/db";
import { getYDoc, setupConnection } from "./connection";

const PORT = Number(process.env.SYNC_PORT ?? process.env.PORT ?? 1234);
const AUTH_SECRET = process.env.AUTH_SECRET;

if (!AUTH_SECRET) {
  console.error("FATAL: AUTH_SECRET is not set.");
  process.exit(1);
}

type ConnContext = { docId: string; userId: string; role: Role };

/**
 * Authorize an upgrade request. Throws (→ 401/403) if identity or access fails.
 * Room name is the URL path (the document id); token is a query param.
 */
async function authorize(req: http.IncomingMessage): Promise<ConnContext> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const docId = decodeURIComponent(url.pathname.slice(1));
  const token = url.searchParams.get("token");

  if (!docId) throw new Error("missing document id");
  if (!token) throw new Error("missing token");

  const { userId } = await verifySyncToken(token, AUTH_SECRET!);

  const access = await getDocumentForUser({ documentId: docId, userId });
  if (!access) throw new Error("no access to document");

  return { docId, userId, role: access.role };
}

const server = http.createServer((_req, res) => {
  // Plain HTTP hits (health checks) get a simple 200.
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("sync server ok\n");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  authorize(req)
    .then((ctx) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req, ctx);
      });
    })
    .catch((err) => {
      console.warn(`[upgrade] rejected: ${err.message}`);
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    });
});

wss.on("connection", (ws: WebSocket, _req: http.IncomingMessage, ctx: ConnContext) => {
  // The room loads from Postgres asynchronously, but the client starts sending
  // immediately. Buffer those early messages so none are lost, then hand them
  // to setupConnection to replay once the doc is ready.
  ws.binaryType = "arraybuffer";
  const buffered: Uint8Array[] = [];
  const bufferEarly = (message: ArrayBuffer) =>
    buffered.push(new Uint8Array(message));
  ws.on("message", bufferEarly);

  getYDoc(ctx.docId)
    .then((doc) => {
      ws.off("message", bufferEarly);
      setupConnection(ws, doc, ctx.role, buffered);
      console.log(`[conn] ${ctx.userId} joined ${ctx.docId} as ${ctx.role}`);
    })
    .catch((err) => {
      console.error(`[conn] failed to open ${ctx.docId}:`, err);
      ws.close();
    });
});

server.listen(PORT, () => {
  console.log(`sync server listening on :${PORT}`);
});
