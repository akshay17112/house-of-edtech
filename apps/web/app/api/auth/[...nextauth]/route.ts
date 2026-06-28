/**
 * Auth.js catch-all route handler.
 * Handles sign-in, sign-out, session, CSRF, and callback endpoints under
 * /api/auth/*. The actual logic lives in apps/web/auth.ts.
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
