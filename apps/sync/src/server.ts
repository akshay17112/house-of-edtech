import { config } from "dotenv";
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
