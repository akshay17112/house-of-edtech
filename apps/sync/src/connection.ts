import { WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import {
  loadDoc,
  schedulePersist,
  flushPersist,
  PERSISTENCE_ORIGIN,
} from "./persistence";
import { canWrite } from "@repo/shared";
import type { Role } from "@repo/db";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const SYNC_STEP1 = 0;
const SYNC_STEP2 = 1;
const SYNC_UPDATE = 2;

const PING_INTERVAL_MS = 30000;


class WSSharedDoc extends Y.Doc {
  name: string;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;

  constructor(name: string) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on(
      "update",
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        conn: WebSocket | null,
      ) => {
        const changed = added.concat(updated, removed);
        if (conn !== null) {
          const ids = this.conns.get(conn);
          if (ids) {
            added.forEach((id) => ids.add(id));
            removed.forEach((id) => ids.delete(id));
          }
        }
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
        );
        const buf = encoding.toUint8Array(encoder);
        this.conns.forEach((_, c) => send(this, c, buf));
      },
    );

    this.on("update", (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const buf = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, buf));

      // Don't re-persist the snapshot we just loaded from Postgres.
      if (origin !== PERSISTENCE_ORIGIN) schedulePersist(this.name, this);
    });
  }
}

const docs = new Map<string, WSSharedDoc>();

export async function getYDoc(docId: string): Promise<WSSharedDoc> {
  const existing = docs.get(docId);
  if (existing) return existing;

  const doc = new WSSharedDoc(docId);
  docs.set(docId, doc);
  await loadDoc(docId, doc);
  return doc;
}

function send(doc: WSSharedDoc, conn: WebSocket, message: Uint8Array) {
  if (conn.readyState !== WebSocket.CONNECTING && conn.readyState !== WebSocket.OPEN) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, (err) => err && closeConn(doc, conn));
  } catch {
    closeConn(doc, conn);
  }
}

function closeConn(doc: WSSharedDoc, conn: WebSocket) {
  const controlledIds = doc.conns.get(conn);
  if (controlledIds) {
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(
      doc.awareness,
      Array.from(controlledIds),
      null,
    );
  }
  conn.close();

  // Last client out: flush the final snapshot, then drop the room from memory.
  if (doc.conns.size === 0) {
    flushPersist(doc.name, doc).finally(() => {
      if (doc.conns.size === 0) {
        docs.delete(doc.name);
        doc.destroy();
      }
    });
  }
}


function handleSyncMessage(
  decoder: decoding.Decoder,
  encoder: encoding.Encoder,
  doc: WSSharedDoc,
  conn: WebSocket,
  writable: boolean,
): void {
  const messageType = decoding.readVarUint(decoder);
  // Reads (step1) are always allowed; writes (step2/update) only if the role can
  // write. This is where viewer = read-only is enforced on the wire.
  switch (messageType) {
    case SYNC_STEP1:
      syncProtocol.readSyncStep1(decoder, encoder, doc);
      break;
    case SYNC_STEP2:
      if (writable) syncProtocol.readSyncStep2(decoder, doc, conn);
      break;
    case SYNC_UPDATE:
      if (writable) syncProtocol.readUpdate(decoder, doc, conn);
      break;
    default:
      throw new Error(`unknown sync message type ${messageType}`);
  }
}

function onMessage(
  doc: WSSharedDoc,
  conn: WebSocket,
  data: Uint8Array,
  role: Role,
) {
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case MESSAGE_SYNC: {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      handleSyncMessage(decoder, encoder, doc, conn, canWrite(role));
      if (encoding.length(encoder) > 1) {
        send(doc, conn, encoding.toUint8Array(encoder));
      }
      break;
    }
    case MESSAGE_AWARENESS:
      awarenessProtocol.applyAwarenessUpdate(
        doc.awareness,
        decoding.readVarUint8Array(decoder),
        conn,
      );
      break;
  }
}

export function setupConnection(
  conn: WebSocket,
  doc: WSSharedDoc,
  role: Role,
  buffered: Uint8Array[] = [],
) {
  conn.binaryType = "arraybuffer";
  doc.conns.set(conn, new Set());

  conn.on("message", (message: ArrayBuffer) =>
    onMessage(doc, conn, new Uint8Array(message), role),
  );

  let alive = true;
  conn.on("pong", () => (alive = true));
  const pingTimer = setInterval(() => {
    if (!alive) {
      clearInterval(pingTimer);
      closeConn(doc, conn);
      return;
    }
    alive = false;
    try {
      conn.ping();
    } catch {
      clearInterval(pingTimer);
      closeConn(doc, conn);
    }
  }, PING_INTERVAL_MS);

  conn.on("close", () => {
    clearInterval(pingTimer);
    closeConn(doc, conn);
  });

  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));
  }

  const states = doc.awareness.getStates();
  if (states.size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(
        doc.awareness,
        Array.from(states.keys()),
      ),
    );
    send(doc, conn, encoding.toUint8Array(encoder));
  }

  // Replay messages that arrived during the async room load — the client sends
  // its syncStep1 the instant it connects, and dropping it leaves an empty doc.
  for (const message of buffered) onMessage(doc, conn, message, role);
}
