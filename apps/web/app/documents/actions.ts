"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createDocument, renameDocument } from "@repo/db";
import { requireUser } from "@/lib/dal";

/**
 * Create a new document owned by the current user, then open its editor.
 * `requireUser()` guarantees we have an authenticated user before writing.
 */
export async function createDocumentAction() {
  const user = await requireUser();
  const { id } = await createDocument({ userId: user.id });

  // Refresh the cached documents list, then jump straight into the editor.
  revalidatePath("/documents");
  redirect(`/documents/${id}`);
}

/**
 * Rename a document the current user can edit.
 *
 * Authorization lives in the query layer: `renameDocument` re-checks membership
 * and rejects viewers, so a client cannot rename a doc it shouldn't. Returns a
 * plain `{ ok }` so the editor can optimistically apply the new title and
 * revert if the server refuses.
 */
export async function renameDocumentAction(
  documentId: string,
  title: string,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const ok = await renameDocument({ documentId, userId: user.id, title });
  if (ok) revalidatePath("/documents");
  return { ok };
}
