import * as Y from "yjs";
import { eq } from "drizzle-orm";
import { db, docState, documents } from "@repo/db";

export const PERSISTENCE_ORIGIN = "persistence";

const DEBOUNCE_MS = 2000;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

export async function loadDoc(docId: string, doc: Y.Doc): Promise<void> {
  const [row] = await db
    .select({ state: docState.state })
    .from(docState)
    .where(eq(docState.documentId, docId))
    .limit(1);

  if (row?.state) {
    // Copy into a clean, zero-offset Uint8Array — the driver's Buffer may be a
    // view into a pooled ArrayBuffer, which Yjs would otherwise decode wrong.
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

  await db.update(documents).set({ updatedAt: now }).where(eq(documents.id, docId));
}

export function schedulePersist(docId: string, doc: Y.Doc): void {
  // Debounced so a burst of edits collapses into one write, not one per keystroke.
  if (pending.has(docId)) return;
  const timer = setTimeout(() => {
    pending.delete(docId);
    writeSnapshot(docId, doc).catch((err) =>
      console.error(`[persist] failed for ${docId}:`, err),
    );
  }, DEBOUNCE_MS);
  pending.set(docId, timer);
}

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
