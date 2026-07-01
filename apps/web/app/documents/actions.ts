"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createDocument, renameDocument, deleteDocument } from "@repo/db";
import { requireUser } from "@/lib/dal";

export async function createDocumentAction() {
  const user = await requireUser();
  const { id } = await createDocument({ userId: user.id });

  revalidatePath("/documents");
  redirect(`/documents/${id}`);
}

export async function renameDocumentAction(
  documentId: string,
  title: string,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const ok = await renameDocument({ documentId, userId: user.id, title });
  if (ok) revalidatePath("/documents");
  return { ok };
}

export async function deleteDocumentAction(
  documentId: string,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const ok = await deleteDocument({ documentId, userId: user.id });
  if (ok) revalidatePath("/documents");
  return { ok };
}
