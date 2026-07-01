import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

const baseFetch: typeof fetch = (...args) => fetch(...args);

// Neon's serverless tier sleeps when idle; the first query can fail with a bare
// "fetch failed" while it wakes. Retry transient network errors with backoff.
neonConfig.fetchFunction = async (input: unknown, init: unknown) => {
  const delays = [300, 700, 1500];
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

// Lazy: the real connection is created on first query, so the app can boot
// (and build) before DATABASE_URL is available.
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
