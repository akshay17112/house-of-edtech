"use client";

import { useTransition } from "react";
import { deleteDocumentAction } from "./actions";

export function DeleteDocButton({
  documentId,
  title,
}: {
  documentId: string;
  title: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label={`Delete ${title}`}
      title="Delete document"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
        startTransition(async () => {
          await deleteDocumentAction(documentId);
        });
      }}
      className="absolute bottom-4 right-4 z-10 rounded-md p-1.5 text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50 dark:hover:bg-red-500/10"
    >
      {pending ? (
        <span className="block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      )}
    </button>
  );
}
