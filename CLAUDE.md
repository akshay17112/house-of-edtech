# House of Edtech — Local-First Collaborative Editor

Monorepo (npm workspaces) for a local-first, offline-syncing collaborative document
editor with deterministic CRDT conflict resolution and version history.

## Layout
- `apps/web`   — Next.js 16 app (frontend, auth, REST APIs, AI). Deploys to Vercel.
- `apps/sync`  — y-websocket server (realtime, role enforcement). Deploys to Railway/Render. (later)
- `packages/db`     — Drizzle schema + scoped queries. (later)
- `packages/shared` — Zod schemas, types, Yjs helpers shared by web + sync. (later)

## Core stack
Next.js 16 · React 19 · TypeScript (strict) · Tailwind v4 · shadcn/ui ·
Yjs + TipTap + y-indexeddb · Auth.js v5 (JWT) · Neon Postgres + Drizzle · Vercel AI SDK (Claude)

## Next.js 16 gotchas (this is NOT Next 15)
- **Async Request APIs**: `cookies()`, `headers()`, `draftMode()`, and `params`/`searchParams`
  are Promises — always `await` them. Type dynamic routes with `PageProps<'/doc/[id]'>`.
- **`middleware.ts` is renamed to `proxy.ts`**; export a `proxy` function. Runs on Node.js
  runtime (no edge). Auth route protection goes here.
- **Turbopack is default** (no `--turbopack` flag needed for dev/build).
- **`next lint` removed** — use the ESLint CLI directly. `next build` does not lint.
- **`revalidateTag(tag, profile)`** requires a cache-life profile as 2nd arg.
- Before using an unfamiliar API, read the bundled docs in `apps/web/node_modules/next/dist/docs/`.

## Conventions
- Editor is a Client Component (`"use client"`, no SSR). Doc list/shell are Server Components.
- Every DB query that touches a document is scoped through `memberships` + the authed `userId`.
  No code path loads a document without proving membership (tenant isolation).
- Viewer role read-only enforcement happens server-side in `apps/sync`, not just the UI.
