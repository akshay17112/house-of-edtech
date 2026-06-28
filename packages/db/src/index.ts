/**
 * Database client.
 *
 * Uses Neon's serverless driver over HTTP, which is ideal for Vercel's
 * serverless functions (no long-lived TCP connection to manage).
 *
 * The connection is created LAZILY on first query, not at import time, so the
 * app boots even before DATABASE_URL is configured. The first actual query
 * without a configured URL throws a clear error.
 *
 *   import { db, schema } from "@repo/db";
 *   const rows = await db.select().from(schema.documents);
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

let instance: DB | null = null;

function getDb(): DB {
  if (instance) return instance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to apps/web/.env.local (see .env.example).",
    );
  }

  instance = drizzle(neon(connectionString), { schema });
  return instance;
}

/**
 * Lazy proxy: `db` can be imported anywhere, but the real connection is only
 * established when a method is first accessed (i.e. an actual query).
 */
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = real[prop as keyof DB];
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(real)
      : value;
  },
});

export { schema };
export * from "./schema";
