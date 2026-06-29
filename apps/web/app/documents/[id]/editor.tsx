"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import type { Role } from "@repo/db";
import { StatusIndicator } from "./status";
import { renameDocumentAction } from "../actions";

/**
 * The local-first editor (Client Component).
 *
 * Data flow (the whole point of "local-first"):
 *
 *   You type ──▶ TipTap ──▶ Y.Doc (the CRDT, in-memory source of truth)
 *                              │
 *                              └─▶ IndexeddbPersistence ──▶ browser IndexedDB
 *
 * There is NO network here. Edits are written to the Y.Doc synchronously (no
 * await, so typing never lags) and mirrored into IndexedDB. Reload the page and
 * the doc is rehydrated from IndexedDB — your work survives offline, refreshes,
 * and even a reboot. The WebSocket sync to other users is layered on in Phase 3
 * as just another plugin on this same Y.Doc.
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
  const [savedLocally, setSavedLocally] = useState(false);

  // Viewers get a read-only editor. (Server-side enforcement comes with the
  // WebSocket server in Phase 3; this is the UI half.)
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

  const editor = useEditor({
    editable,
    extensions: [
      // Disable StarterKit's built-in undo/redo: the CRDT (Collaboration)
      // provides history that is correct under concurrent editing.
      StarterKit.configure({ undoRedo: false }),
      // Bind the editor to our Y.Doc — this is the TipTap ⇄ Yjs link.
      Collaboration.configure({ document: ydoc }),
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
          <StatusIndicator savedLocally={savedLocally} />
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
