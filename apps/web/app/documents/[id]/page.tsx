import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDocumentForUser } from "@repo/db";
import { requireUser } from "@/lib/dal";
import { Editor } from "./editor";

export const metadata: Metadata = { title: "Editor" };

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
