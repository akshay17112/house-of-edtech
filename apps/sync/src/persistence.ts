/**
 * Postgres persistence for Yjs documents.
 *
 * The CRDT in memory is the live source of truth while a room is open; this
 * module is how that state survives the room going cold (everyone disconnects)
 * and how it is rehydrated when the room re-opens.
 *
 * Strategy: keep one compacted snapshot per document in `doc_state`. We do NOT
 * write on every keystroke — that would hammer the database. Instead writes are
 * DEBOUNCED (and force-flushed when the last client leaves), trading a few
 * seconds of "last edit not yet in Postgres" for far fewer round-trips. Clients
 * never lose those seconds anyway: their own IndexedDB (Phase 2) holds the
 * edits locally until the snapshot catches up.
 */
import * as Y from "yjs";
import { eq } from "drizzle-orm";
import { db, docState, documents } from "@repo/db";

/** Marks updates that came FROM Postgres, so we don't immediately write them back. */
export const PERSISTENCE_ORIGIN = "persistence";

const DEBOUNCE_MS = 2000;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Load the stored snapshot (if any) into a fresh Y.Doc. */
export async function loadDoc(docId: string, doc: Y.Doc): Promise<void> {
  const [row] = await db
    .select({ state: docState.state })
    .from(docState)
    .where(eq(docState.documentId, docId))
    .limit(1);

  if (row?.state) {
    // The driver hands back a Node Buffer, which can be a VIEW into a larger
    // pooled ArrayBuffer (non-zero byteOffset). Yjs/lib0 reads the underlying
    // bytes from offset 0, so we must copy into a clean, zero-offset array or
    // the decode silently reads garbage. `new Uint8Array(buf)` copies.
    Y.applyUpdate(doc, new Uint8Array(row.state), PERSISTENCE_ORIGIN);
  }
}

async function writeSnapshot(docId: string, doc: Y.Doc): Promise<void> {
  const state = Y.encodeStateAsUpdate(doc);
  const stateVector = Y.encodeStateVector(doc);
  const now = new Date();

  await db
    .insert(docState)
    .values({ documentId: docId, state, stateVector, updatedAt: now })
    .onConflictDoUpdate({
      target: docState.documentId,
      set: { state, stateVector, updatedAt: now },
    });

  // Keep the dashboard's "Updated …" timestamp in step with real edits.
  await db.update(documents).set({ updatedAt: now }).where(eq(documents.id, docId));
}

/** Schedule a debounced snapshot write. Repeated calls within the window coalesce. */
export function schedulePersist(docId: string, doc: Y.Doc): void {
  if (pending.has(docId)) return;
  const timer = setTimeout(() => {
    pending.delete(docId);
    writeSnapshot(docId, doc).catch((err) =>
      console.error(`[persist] failed for ${docId}:`, err),
    );
  }, DEBOUNCE_MS);
  pending.set(docId, timer);
}

/** Write immediately (used when the last client leaves a room). */
export async function flushPersist(docId: string, doc: Y.Doc): Promise<void> {
  const timer = pending.get(docId);
  if (timer) {
    clearTimeout(timer);
    pending.delete(docId);
  }
  await writeSnapshot(docId, doc).catch((err) =>
    console.error(`[persist] flush failed for ${docId}:`, err),
  );
}
