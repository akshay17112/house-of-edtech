/**
 * Auth.js v5 configuration.
 *
 * Strategy: email + password (Credentials provider) with **JWT sessions**.
 * We use JWT (not database sessions) on purpose: the token is a stateless,
 * signed proof of identity that BOTH the Next.js app and the separate
 * WebSocket sync server can verify with the same secret — one identity
 * across two servers. (See CLAUDE.md / ARCHITECTURE.md.)
 *
 * Exports:
 *  - handlers: the GET/POST route handlers for /api/auth/*
 *  - auth:     read the session in Server Components, route handlers, and proxy
 *  - signIn / signOut: server-side helpers
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@repo/db";
import { credentialsSchema } from "@/lib/validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Stateless JWT sessions — see file header for why.
  session: { strategy: "jwt" },

  // Send unauthenticated users to our own login page, not the default one.
  pages: { signIn: "/login" },

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      /**
       * Runs on the server when a user submits the login form.
       * Returns a user object on success, or null to reject the login.
       * We NEVER reveal whether the email or the password was the wrong one.
       */
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const [user] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, email.toLowerCase()))
          .limit(1);

        // No such user, or an OAuth-only user with no password set.
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  callbacks: {
    // Persist the user id into the JWT on sign-in.
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    // Expose the user id on the session object the app reads.
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
