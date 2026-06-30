"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import type { Role } from "@repo/db";
import { StatusIndicator, type Connection } from "./status";
import { renameDocumentAction } from "../actions";

const SYNC_URL =
  process.env.NEXT_PUBLIC_SYNC_URL ?? "ws://localhost:1234";

// A small fixed palette; each collaborator gets a stable color derived from
// their name, so the same person is the same color for everyone in the room.
const CURSOR_COLORS = [
  "#f783ac", "#9775fa", "#4dabf7", "#38d9a9",
  "#ffa94d", "#ff6b6b", "#a9e34b", "#22b8cf",
];
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

/**
 * The local-first editor (Client Component).
 *
 * Data flow (the whole point of "local-first"):
 *
 *   You type ──▶ TipTap ──▶ Y.Doc (the CRDT, in-memory source of truth)
 *                              │
 *                              └─▶ IndexeddbPersistence ──▶ browser IndexedDB
 *
 * Edits are written to the Y.Doc synchronously (no await, so typing never lags)
 * and mirrored into IndexedDB. Reload the page and the doc is rehydrated from
 * IndexedDB — your work survives offline, refreshes, and even a reboot.
 *
 * Phase 3 adds realtime sync as just ANOTHER plugin on the SAME Y.Doc: a
 * WebsocketProvider to the sync server. Yjs merges the WebSocket peer and the
 * IndexedDB copy deterministically (CRDT), so local-first and realtime coexist
 * — go offline and the IndexedDB path keeps working; reconnect and edits merge.
 */
export function Editor({
  docId,
  initialTitle,
  role,
  userName,
}: {
  docId: string;
  initialTitle: string;
  role: Role;
  userName: string;
}) {
  // One Y.Doc per mount. useMemo keeps the SAME instance across re-renders.
  const ydoc = useMemo(() => new Y.Doc(), []);
  // Awareness (ephemeral presence: who's here + cursor position). Created
  // synchronously so the editor can render cursors immediately; the WebSocket
  // provider (attached later, after the token fetch) shares THIS instance to
  // sync presence over the network.
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);
  const [savedLocally, setSavedLocally] = useState(false);
  const [connection, setConnection] = useState<Connection>("connecting");

  // Viewers get a read-only editor. This is the UI half; the sync server
  // ENFORCES read-only on the wire (a viewer's edits never reach other peers
  // or the database), so this isn't the only line of defense.
  const editable = role !== "viewer";

  // Attach IndexedDB persistence to the Y.Doc. This both loads any existing
  // content and saves every future change locally.
  useEffect(() => {
    const persistence = new IndexeddbPersistence(`doc:${docId}`, ydoc);
    const onSynced = () => setSavedLocally(true);
    persistence.on("synced", onSynced);

    return () => {
      persistence.off("synced", onSynced);
      persistence.destroy();
    };
  }, [docId, ydoc]);

  // Attach the realtime WebSocket provider to the SAME Y.Doc. We first fetch a
  // short-lived sync token from our own origin (the socket server can't read
  // the session cookie), then connect with it as a query param.
  useEffect(() => {
    let provider: WebsocketProvider | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/sync/token");
        if (!res.ok) throw new Error(`token request failed: ${res.status}`);
        const { token } = (await res.json()) as { token: string };
        if (cancelled) return;

        provider = new WebsocketProvider(SYNC_URL, docId, ydoc, {
          params: { token },
          awareness, // share the instance the editor already renders cursors from
        });
        provider.on("status", (e: { status: Connection }) =>
          setConnection(e.status),
        );
      } catch {
        if (!cancelled) setConnection("disconnected");
      }
    })();

    return () => {
      cancelled = true;
      provider?.destroy();
    };
  }, [docId, ydoc, awareness]);

  const editor = useEditor({
    editable,
    extensions: [
      // Disable StarterKit's built-in undo/redo: the CRDT (Collaboration)
      // provides history that is correct under concurrent editing.
      StarterKit.configure({ undoRedo: false }),
      // Bind the editor to our Y.Doc — this is the TipTap ⇄ Yjs link.
      Collaboration.configure({ document: ydoc }),
      // Render other people's live cursors + name labels. It only reads
      // `provider.awareness`, so we hand it the awareness instance directly —
      // that way cursors work the instant the editor mounts, before (and even
      // without) a WebSocket connection.
      CollaborationCaret.configure({
        provider: { awareness },
        user: { name: userName, color: colorFor(userName) },
      }),
    ],
    // Required in Next.js/SSR: don't render synchronously on the server.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "ProseMirror-editor focus:outline-none min-h-[60vh] max-w-none",
      },
    },
  });

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/documents"
              className="shrink-0 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            >
              ← Docs
            </Link>
            <DocTitle docId={docId} initialTitle={initialTitle} editable={editable} />
            {role === "viewer" && (
              <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-white/10 dark:text-neutral-400">
                view only
              </span>
            )}
          </div>
          <StatusIndicator savedLocally={savedLocally} connection={connection} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <p className="text-sm text-neutral-400">Loading editor…</p>
        )}
      </main>
    </div>
  );
}

/**
 * Click-to-edit document title.
 *
 * Editors/owners see a button that turns into an input on click; viewers get
 * plain text (the server rejects their renames anyway — this just hides the UI).
 * The rename is applied optimistically and reverted if the server says no, so a
 * forbidden or failed save never leaves a stale title on screen.
 */
function DocTitle({
  docId,
  initialTitle,
  editable,
}: {
  docId: string;
  initialTitle: string;
  editable: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialTitle);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!editable) {
    return <span className="truncate font-medium">{title}</span>;
  }

  function commit() {
    setEditing(false);
    const next = draft.trim() || "Untitled";
    setDraft(next);
    if (next === title) return;

    const previous = title;
    setTitle(next); // optimistic
    startTransition(async () => {
      const { ok } = await renameDocumentAction(docId, next);
      if (!ok) {
        setTitle(previous); // server refused (e.g. lost access) — revert
        setDraft(previous);
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
        title="Rename document"
        className="-mx-1 truncate rounded px-1 text-left font-medium hover:bg-black/5 dark:hover:bg-white/10"
      >
        {title}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setDraft(title);
          setEditing(false);
        }
      }}
      className="min-w-0 flex-1 rounded border border-black/15 bg-transparent px-1 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-white/20"
    />
  );
}
