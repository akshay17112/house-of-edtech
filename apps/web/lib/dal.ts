import "server-only";

import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Data Access Layer (DAL).
 *
 * Next.js recommends centralizing authorization "as close as possible to your
 * data source" rather than relying on the proxy alone. Every server-side data
 * read starts here, so there is one place that answers "who is asking?".
 *
 * `requireUser()` is the gate for protected pages/actions: it returns the
 * session user or redirects to /login. Document-level checks (is this user an
 * owner/editor/viewer of doc X?) build on top of this — added in the docs phase.
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
