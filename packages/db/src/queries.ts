// Tenant isolation: every query here joins `memberships` on the given userId,
// so there is no way to read or touch a document the user isn't a member of.
import { and, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { documents, memberships, type Role } from "./schema";

export type DocumentListItem = {
  id: string;
  title: string;
  role: Role;
  updatedAt: Date;
};

export async function listDocumentsForUser(
  userId: string,
): Promise<DocumentListItem[]> {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      role: memberships.role,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .innerJoin(memberships, eq(memberships.documentId, documents.id))
    .where(eq(memberships.userId, userId))
    .orderBy(desc(documents.updatedAt));
}

export async function createDocument(input: {
  userId: string;
  title?: string;
}): Promise<{ id: string }> {
  const [doc] = await db
    .insert(documents)
    .values({ ownerId: input.userId, title: input.title?.trim() || "Untitled" })
    .returning({ id: documents.id });

  await db.insert(memberships).values({
    documentId: doc.id,
    userId: input.userId,
    role: "owner",
  });

  return { id: doc.id };
}

export async function getDocumentForUser(input: {
  documentId: string;
  userId: string;
}): Promise<{ id: string; title: string; role: Role } | null> {
  const [row] = await db
    .select({
      id: documents.id,
      title: documents.title,
      role: memberships.role,
    })
    .from(documents)
    .innerJoin(memberships, eq(memberships.documentId, documents.id))
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(memberships.userId, input.userId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function deleteDocument(input: {
  documentId: string;
  userId: string;
}): Promise<boolean> {
  const access = await getDocumentForUser({
    documentId: input.documentId,
    userId: input.userId,
  });
  if (access?.role !== "owner") return false;

  await db.delete(documents).where(eq(documents.id, input.documentId));
  return true;
}

export async function renameDocument(input: {
  documentId: string;
  userId: string;
  title: string;
}): Promise<boolean> {
  const access = await getDocumentForUser({
    documentId: input.documentId,
    userId: input.userId,
  });
  if (!access || access.role === "viewer") return false;

  await db
    .update(documents)
    .set({ title: input.title.trim() || "Untitled", updatedAt: new Date() })
    .where(eq(documents.id, input.documentId));

  return true;
}
