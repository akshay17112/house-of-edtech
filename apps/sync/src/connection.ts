/**
 * Per-document rooms and the Yjs wire protocol — with server-side role enforcement.
 *
 * This is a focused reimplementation of y-websocket's server protocol (rather
 * than its stock `setupWSConnection`) because we need two things the stock
 * server doesn't give us:
 *
 *   1. ROLE ENFORCEMENT. A `viewer` connection may READ the document and
 *      broadcast presence (cursor/awareness), but any document-mutating message
 *      it sends is DROPPED on the floor — the edit never enters the shared doc,
 *      so it can never reach other clients or Postgres. This is the real
 *      read-only guarantee; the editor's read-only mode is only the UI half.
 *   2. Our own Postgres persistence (see persistence.ts).
 *
 * Wire protocol recap (same as y-websocket clients speak):
 *   message = varUint(type) ++ payload
 *     type 0 = sync       (y-protocols/sync: step1 / step2 / update)
 *     type 1 = awareness   (y-protocols/awareness)
 */
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
import type { Role } from "@repo/db";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

// Sub-types inside a sync message (from y-protocols/sync).
const SYNC_STEP1 = 0; // peer announces its state vector → we reply with the diff (READ)
const SYNC_STEP2 = 1; // peer sends a diff to apply                              (WRITE)
const SYNC_UPDATE = 2; // peer sends an incremental update                       (WRITE)

const PING_INTERVAL_MS = 30000;

const canWrite = (role: Role) => role === "owner" || role === "editor";

/* -------------------------------------------------------------------------- */
/* Rooms                                                                      */
/* -------------------------------------------------------------------------- */

class WSSharedDoc extends Y.Doc {
  name: string;
  awareness: awarenessProtocol.Awareness;
  /** conn → the awareness clientIDs it controls (for cleanup on disconnect). */
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

    // Any change to the shared doc → broadcast to everyone and schedule a save.
    this.on("update", (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const buf = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, buf));

      // Don't write straight back the snapshot we just loaded from Postgres.
      if (origin !== PERSISTENCE_ORIGIN) schedulePersist(this.name, this);
    });
  }
}

const docs = new Map<string, WSSharedDoc>();

/** Get or create the room for a document, hydrating from Postgres on first open. */
export async function getYDoc(docId: string): Promise<WSSharedDoc> {
  const existing = docs.get(docId);
  if (existing) return existing;

  const doc = new WSSharedDoc(docId);
  docs.set(docId, doc);
  await loadDoc(docId, doc);
  return doc;
}

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

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

  // Last one out: flush the latest state to Postgres and free the room.
  if (doc.conns.size === 0) {
    flushPersist(doc.name, doc).finally(() => {
      if (doc.conns.size === 0) {
        docs.delete(doc.name);
        doc.destroy();
      }
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Receiving                                                                  */
/* -------------------------------------------------------------------------- */

function handleSyncMessage(
  decoder: decoding.Decoder,
  encoder: encoding.Encoder,
  doc: WSSharedDoc,
  conn: WebSocket,
  writable: boolean,
): void {
  const messageType = decoding.readVarUint(decoder);
  switch (messageType) {
    case SYNC_STEP1:
      // Peer wants the document. Reading is always allowed (even for viewers).
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
      // Only reply if the handler wrote something back (e.g. a step1 response).
      if (encoding.length(encoder) > 1) {
        send(doc, conn, encoding.toUint8Array(encoder));
      }
      break;
    }
    case MESSAGE_AWARENESS:
      // Presence is allowed for everyone, including viewers.
      awarenessProtocol.applyAwarenessUpdate(
        doc.awareness,
        decoding.readVarUint8Array(decoder),
        conn,
      );
      break;
  }
}

/* -------------------------------------------------------------------------- */
/* Connection setup                                                           */
/* -------------------------------------------------------------------------- */

export function setupConnection(
  conn: WebSocket,
  doc: WSSharedDoc,
  role: Role,
  /**
   * Messages that arrived while the room was still loading from Postgres, before
   * this listener was attached. The client sends its `syncStep1` the instant the
   * socket opens — if we drop it during the async load, the server never sends
   * the document state back and the client shows an empty doc. So we replay them.
   */
  buffered: Uint8Array[] = [],
) {
  conn.binaryType = "arraybuffer";
  doc.conns.set(conn, new Set());

  conn.on("message", (message: ArrayBuffer) =>
    onMessage(doc, conn, new Uint8Array(message), role),
  );

  // Keepalive: drop dead connections so rooms don't leak.
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

  // 1) Kick off the sync handshake: send our state vector (step1).
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));
  }

  // 2) Send the current presence of everyone already in the room.
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

  // 3) Replay anything the client sent while the room was loading (notably its
  //    own syncStep1) — now that the doc has content, these get proper replies.
  for (const message of buffered) onMessage(doc, conn, message, role);
}
