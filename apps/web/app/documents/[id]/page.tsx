import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDocumentForUser } from "@repo/db";
import { requireUser } from "@/lib/dal";
import { Editor } from "./editor";

export const metadata: Metadata = { title: "Editor" };

/**
 * Document editor page (Server Component).
 *
 * Authorization happens here, close to the data:
 *   1. requireUser()      → must be logged in
 *   2. getDocumentForUser → must be a member of THIS document
 * If they're not a member we call notFound(), so a non-member cannot even
 * tell whether the document exists.
 *
 * In Next.js 16 `params` is a Promise and must be awaited.
 */
export default async function DocumentPage({
  params,
}: PageProps<"/documents/[id]">) {
  const user = await requireUser();
  const { id } = await params;

  const doc = await getDocumentForUser({ documentId: id, userId: user.id });
  if (!doc) notFound();

  return (
    <Editor
      docId={doc.id}
      initialTitle={doc.title}
      role={doc.role}
      userName={user.name ?? user.email ?? "You"}
    />
  );
}
