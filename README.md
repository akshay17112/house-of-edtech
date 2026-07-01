# Collab Editor — a local-first, real-time collaborative document editor

A production-style collaborative document editor: multiple people edit the same
document **at the same time**, it keeps working **offline**, and edits merge
**deterministically** (no "last write wins" data loss) thanks to CRDTs. Built
for the House of Edtech full-stack assignment — deliberately **not** a CRUD/
to-do app.

- **Live app:** https://house-of-edtech-web.vercel.app
- **Realtime server:** https://house-of-edtech-sync.onrender.com
- **Author:** Akshay Tayade — [GitHub](https://github.com/akshay17112) · [LinkedIn](https://www.linkedin.com/in/akshay-tayade)

---

## Why this, and why it's hard

A naïve collaborative editor saves the whole document on every keystroke and
lets the last save win — concurrent edits silently clobber each other, and it
breaks the moment the network blips. This app instead treats the document as a
**CRDT** (Conflict-free Replicated Data Type, via [Yjs](https://yjs.dev)):

- **Local-first:** your keystrokes apply instantly to an in-browser copy and are
  saved to IndexedDB. No network round-trip on the typing path, so it never lags
  and it works fully offline.
- **Real-time:** the same document is mirrored to other users over WebSockets;
  concurrent edits from everyone merge into one consistent state, automatically.
- **Durable:** the server compacts the CRDT state into Postgres so documents
  survive even when every client disconnects.

## Features

- ✍️ Rich-text editor (TipTap/ProseMirror) bound to a Yjs document
- 👥 **Real-time multi-user editing** with live, named, colored **collaborator cursors**
- 📴 **Offline editing** — edits persist to IndexedDB and re-sync on reconnect
- 🔐 **Auth** (email/password, JWT sessions) and **granular authorization**
  (per-document `owner` / `editor` / `viewer` roles)
- 🚫 **Server-enforced read-only** for viewers — enforced on the WebSocket wire,
  not just hidden in the UI
- 🧾 Full **CRUD** on documents (create, open, rename, delete)
- 🤖 **AI writing assistant** (Groq via the Vercel AI SDK): improve, fix grammar,
  summarize, continue — streamed straight into the document
- 🟢 Live save/connection status indicator

## Architecture

```
                 Browser (Next.js client)
   ┌───────────────────────────────────────────────┐
   │  TipTap editor ── Yjs Y.Doc (CRDT, in memory)  │
   │                       │                        │
   │        ┌──────────────┼───────────────┐        │
   │        ▼                              ▼         │
   │  IndexedDB (offline)        y-websocket client  │
   └───────────────────────────────────│───────────┘
                                        │ wss + short-lived token
                                        ▼
                         apps/sync  (Node WebSocket server)
                          • verifies token  → userId
                          • checks membership → role
                          • viewer = read-only (drops their writes)
                          • debounced snapshot persistence
                                        │
                                        ▼
                              Neon Postgres (Drizzle)
```

The key idea: **real-time sync is just another plugin on the same Y.Doc** the
offline editor already uses. Yjs merges the IndexedDB copy and the WebSocket
peer deterministically, so local-first and real-time coexist.

### Monorepo layout (npm workspaces)

| Path | What |
|---|---|
| `apps/web` | Next.js 16 app — UI, auth, REST/Server Actions, AI route. Deploys to **Vercel**. |
| `apps/sync` | y-websocket server — realtime + server-side role enforcement + persistence. Deploys to **Render**. |
| `packages/db` | Drizzle schema + tenant-scoped queries. |
| `packages/shared` | Zod/types + the sync-token sign/verify shared by web & sync. |

## Tech stack

Next.js 16 · React 19 · TypeScript (strict) · Tailwind CSS v4 · Yjs + TipTap +
y-indexeddb · y-websocket (`ws`) · Auth.js v5 (JWT) · Neon Postgres + Drizzle ·
Vercel AI SDK + Groq · Vitest · deployed on Vercel + Render.

## CRUD mapping

| Operation | Where |
|---|---|
| **Create** | `createDocument` → "New document" button |
| **Read** | `listDocumentsForUser` (dashboard), `getDocumentForUser` (editor, membership-checked) |
| **Update** | document content (CRDT) + `renameDocument` (inline title edit) |
| **Delete** | `deleteDocument` (owner-only) → trash button on each owned card |

Every query is **tenant-scoped**: it joins `memberships` against the
authenticated `userId`, so there is no code path that reads or mutates a
document the user isn't a member of.

## Security — threats, mitigations, contingencies

| Risk | Mitigation | Contingency |
|---|---|---|
| **Tenant data leakage** (reading others' docs) | Every DB query joins `memberships` on the authed `userId`; the editor returns **404** (not 403) for non-members so existence isn't leaked. | Planned: Postgres Row-Level Security as defense-in-depth. |
| **Privilege escalation** (viewer editing) | Role enforced **server-side on the WebSocket** — a viewer's document updates are dropped before they enter the shared doc; REST mutations re-check role. UI read-only is only cosmetic. | Audit log of writes; revoke membership invalidates access on next op. |
| **Cross-origin auth** (cookie can't reach the sync server) | The web app mints a **short-lived JWT** (`jose`, 5-min TTL) signed with the shared `AUTH_SECRET`; the sync server verifies it on the WS handshake. No long-lived secret on the wire. | Short TTL bounds replay; rotating `AUTH_SECRET` invalidates all tokens. |
| **Credential theft** | Passwords hashed with **bcrypt**; never stored or logged in plaintext. JWT sessions, no server-side session store to leak. | Optional 2FA / OAuth providers (schema already allows null password). |
| **Injection / bad input** | Drizzle parameterized queries (no string-built SQL); **Zod** validation on auth input; titles trimmed/bounded. | — |
| **Transient DB / cold starts** | Neon cold-start `fetch` retried with backoff; `/documents` error boundary; client reconnects and rehydrates from IndexedDB so no data is lost during an outage. | Local-first means clients keep working through a server outage. |
| **Secret exposure** | All secrets are host env vars (`.env*` gitignored); `NEXT_PUBLIC_*` only holds the non-secret sync URL. | — |

## Real-world considerations

- **Scalability:** rooms are held in memory in a single sync instance. This is
  documented and intentional for the free tier; horizontal scale would add a
  shared backplane (e.g. Redis pub/sub) so instances share room state.
- **Error handling:** lazy DB client with retry, route-level error boundary,
  graceful WebSocket close on shutdown, optimistic-with-revert UI for rename.
- **Free-tier trade-off:** Render's free instance sleeps after 15 min idle
  (~1 min cold start). Local-first + Postgres persistence make this lossless —
  only the first connection after idle waits.

## Local development

```bash
# 1. Install (from repo root — npm workspaces)
npm install

# 2. Configure env
cp apps/web/.env.example apps/web/.env.local   # fill AUTH_SECRET, DATABASE_URL, GROQ_API_KEY
cp apps/sync/.env.example apps/sync/.env.local  # same AUTH_SECRET + DATABASE_URL

# 3. Push the schema to your Neon DB (first time)
npm run db:push --workspace=@repo/db

# 4. Run both services (two terminals)
npm run dev   --workspace=apps/web    # http://localhost:3000
npm run start --workspace=apps/sync   # ws://localhost:1234
```

## Testing

Unit tests with **Vitest** cover the security-critical pure logic (sync-token
sign/verify, role gating, cursor color). End-to-end realtime/role behavior was
validated with headless-browser scripts during development.

```bash
npm test   # runs the Vitest suite
```

## Deployment & CI/CD

- **Web** → Vercel (root directory `apps/web`). **Sync** → Render (free Node web
  service, repo root, `npm run start --workspace=apps/sync`). **DB** → Neon.
- **CD:** both hosts auto-deploy on push to `main`.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) runs install → lint →
  typecheck → tests on every push and PR.

Required env vars (must match across web & sync): `AUTH_SECRET`, `DATABASE_URL`.
Web also needs `NEXT_PUBLIC_SYNC_URL` (the deployed `wss://` URL) and
`GROQ_API_KEY`.

---

Built by **Akshay Tayade** · [GitHub](https://github.com/akshay17112) · [LinkedIn](https://www.linkedin.com/in/akshay-tayade)
