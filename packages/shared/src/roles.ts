/**
 * Authorization predicates for the per-document role model.
 *
 * Kept as pure functions in shared so the SAME rule is used by the sync server
 * (wire-level enforcement) and is unit-testable in isolation. Mirrors the
 * `role` enum in the database schema.
 */
export type Role = "owner" | "editor" | "viewer";

/** Owners and editors may modify document content/title; viewers may not. */
export function canWrite(role: Role): boolean {
  return role === "owner" || role === "editor";
}

/** Only the owner may delete a document. */
export function canDelete(role: Role): boolean {
  return role === "owner";
}
