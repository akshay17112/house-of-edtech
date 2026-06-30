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
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Retry transient NETWORK failures.
 *
 * Neon's free tier "scales to zero" — it suspends the database after a few
 * minutes of inactivity. The first request while it is waking up can fail with
 * a bare `fetch failed`. That is a transient, recoverable error, so we retry a
 * few times with increasing backoff instead of letting the page crash.
 *
 * Only thrown (network-level) errors are retried; HTTP error *responses* are
 * returned normally, so real query errors still surface immediately.
 */
const baseFetch: typeof fetch = (...args) => fetch(...args);

neonConfig.fetchFunction = async (input: unknown, init: unknown) => {
  const delays = [300, 700, 1500]; // ms; up to 3 retries after the first try
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await baseFetch(
        input as Parameters<typeof fetch>[0],
        init as Parameters<typeof fetch>[1],
      );
    } catch (error) {
      lastError = error;
      if (attempt < delays.length) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
  }
  throw lastError;
};

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
export * from "./queries";
