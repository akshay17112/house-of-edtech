"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { db, schema } from "@repo/db";
import { signIn } from "@/auth";
import { registerSchema, credentialsSchema } from "@/lib/validation";

/**
 * Server Actions for auth. These run only on the server (note "use server"),
 * so password hashing and DB access never touch the client.
 *
 * Each returns a small `{ error }` object on failure that the client form
 * renders. On success they sign the user in and redirect.
 */

export type AuthActionState = { error?: string } | undefined;

const DEFAULT_REDIRECT = "/documents";

/** Register a new user, then sign them in. */
export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Invalid input." };
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(schema.users).values({
    name,
    email: normalizedEmail,
    passwordHash,
  });

  // Sign the new user in. redirectTo throws a redirect, which is expected.
  await signIn("credentials", {
    email: normalizedEmail,
    password,
    redirectTo: DEFAULT_REDIRECT,
  });
}

/** Sign an existing user in. */
export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Please enter a valid email and password." };
  }

  const callbackUrl =
    (formData.get("callbackUrl") as string | null) ?? DEFAULT_REDIRECT;

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    // Auth.js throws a redirect on success; only treat real auth errors here.
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }
}
