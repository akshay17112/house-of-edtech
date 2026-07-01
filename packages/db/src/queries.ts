/**
 * Tenant-scoped document queries.
 *
 * THE security rule of this app: a user may only ever touch a document they
 * have a membership for. Every query here joins `memberships` against the
 * given userId, so there is no way to read or list another tenant's document
 * through this layer. (Defense in depth: Postgres RLS is added later.)
 *
 * These functions take a trusted `userId` (resolved from the session by the
 * caller in apps/web/lib) — they do not read the session themselves.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { documents, memberships, type Role } from "./schema";

export type DocumentListItem = {
  id: string;
  title: string;
  role: Role;
  updatedAt: Date;
};

/** All documents this user can access, most-recently-updated first. */
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

/**
 * Create a document owned by this user.
 *
 * Inserts the document and the owner membership. The Neon HTTP driver is
 * stateless and does not support multi-statement transactions, so these run
 * sequentially; `documents.ownerId` also records ownership independently, so
 * ownership is never lost even in the unlikely gap between the two inserts.
 */
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

/**
 * Fetch a single document IF the user is a member, returning their role.
 * Returns null when the user has no access — the caller treats that as 404,
 * so we never reveal whether a document exists to non-members.
 */
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

/**
 * Delete a document. OWNER ONLY — editors and viewers cannot delete.
 * The DB cascades (memberships, doc_state, doc_updates, versions all have
 * `onDelete: "cascade"`), so this removes the document and everything tied to
 * it. Returns false if the user isn't the owner (or has no access at all).
 */
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

/** Rename a document the user can edit (owner/editor). */
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
