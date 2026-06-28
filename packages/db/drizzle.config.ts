import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config — drives migration generation and `db:push`.
 * Reads DATABASE_URL from the environment (loaded from .env via dotenv).
 */
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
