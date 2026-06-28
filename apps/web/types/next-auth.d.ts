/**
 * Module augmentation: add our custom `id` field to the Auth.js session/JWT
 * types so `session.user.id` is type-safe everywhere.
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
