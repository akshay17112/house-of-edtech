export type Role = "owner" | "editor" | "viewer";

export function canWrite(role: Role): boolean {
  return role === "owner" || role === "editor";
}

export function canDelete(role: Role): boolean {
  return role === "owner";
}
