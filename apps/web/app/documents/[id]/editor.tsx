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

const CURSOR_COLORS = [
  "#f783ac", "#9775fa", "#4dabf7", "#38d9a9",
  "#ffa94d", "#ff6b6b", "#a9e34b", "#22b8cf",
];
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

const AI_ACTIONS = [
  { key: "improve", label: "Improve writing" },
  { key: "grammar", label: "Fix grammar & spelling" },
  { key: "summarize", label: "Summarize" },
  { key: "continue", label: "Continue writing" },
] as const;

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
  const ydoc = useMemo(() => new Y.Doc(), []);
  // Created here (not by the provider) so cursors render immediately and the
  // WebSocket provider can share the same awareness once it connects.
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc]);
  const [savedLocally, setSavedLocally] = useState(false);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const editable = role !== "viewer";

  useEffect(() => {
    const persistence = new IndexeddbPersistence(`doc:${docId}`, ydoc);
    const onSynced = () => setSavedLocally(true);
    persistence.on("synced", onSynced);

    return () => {
      persistence.off("synced", onSynced);
      persistence.destroy();
    };
  }, [docId, ydoc]);

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
          awareness,
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
      // Disable StarterKit history; the CRDT provides undo/redo correct under concurrent edits.
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({
        provider: { awareness },
        user: { name: userName, color: colorFor(userName) },
      }),
    ],
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "ProseMirror-editor focus:outline-none min-h-[60vh] max-w-none",
      },
    },
  });

  async function runAi(action: string) {
    setAiOpen(false);
    if (!editor || aiBusy) return;

    const { from, to, empty } = editor.state.selection;
    const hasSelection = !empty;
    const source = hasSelection
      ? editor.state.doc.textBetween(from, to, "\n")
      : editor.getText();
    if (!source.trim()) return;

    const isReplace = action === "improve" || action === "grammar";
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, text: source }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.json().catch(() => null);
        window.alert(msg?.error ?? "AI request failed.");
        return;
      }

      if (isReplace) {
        if (hasSelection) editor.chain().focus().deleteRange({ from, to }).run();
        else editor.chain().focus().selectAll().deleteSelection().run();
      } else {
        editor
          .chain()
          .focus()
          .setTextSelection(editor.state.doc.content.size)
          .run();
        editor.commands.insertContent("\n\n");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) editor.commands.insertContent(chunk);
      }
    } catch {
      window.alert("AI request failed — check your connection.");
    } finally {
      setAiBusy(false);
    }
  }

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
          <div className="flex items-center gap-3">
            {editable && editor && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAiOpen((o) => !o)}
                  disabled={aiBusy}
                  aria-haspopup="menu"
                  aria-expanded={aiOpen}
                  className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-black/5 disabled:opacity-60 dark:border-white/15 dark:text-neutral-200 dark:hover:bg-white/10"
                >
                  {aiBusy ? "✨ Thinking…" : "✨ AI"}
                </button>
                {aiOpen && (
                  <>
                    <button
                      type="button"
                      aria-hidden
                      tabIndex={-1}
                      onClick={() => setAiOpen(false)}
                      className="fixed inset-0 z-10 cursor-default"
                    />
                    <div
                      role="menu"
                      className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-md border border-black/10 bg-white py-1 text-sm shadow-lg dark:border-white/15 dark:bg-neutral-900"
                    >
                      {AI_ACTIONS.map((a) => (
                        <button
                          key={a.key}
                          type="button"
                          role="menuitem"
                          onClick={() => runAi(a.key)}
                          className="block w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {a.label}
                        </button>
                      ))}
                      <p className="border-t border-black/5 px-3 pt-1.5 pb-1 text-[11px] text-neutral-400 dark:border-white/10">
                        Works on your selection, or the whole doc.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
            <StatusIndicator savedLocally={savedLocally} connection={connection} />
          </div>
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
    setTitle(next);
    startTransition(async () => {
      const { ok } = await renameDocumentAction(docId, next);
      if (!ok) {
        setTitle(previous);
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
