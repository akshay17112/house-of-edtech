import type { Metadata } from "next";
import Link from "next/link";
import { listDocumentsForUser } from "@repo/db";
import { requireUser } from "@/lib/dal";
import { signOut } from "@/auth";
import { Footer } from "@/components/footer";
import { createDocumentAction } from "./actions";
import { DeleteDocButton } from "./delete-button";

export const metadata: Metadata = { title: "Your documents" };

export default async function DocumentsPage() {
  const user = await requireUser();
  const docs = await listDocumentsForUser(user.id);

  return (
    <>
      <header className="mx-auto w-full max-w-5xl px-6 py-5 flex items-center justify-between">
        <span className="font-semibold tracking-tight">Your documents</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-500">{user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <form action={createDocumentAction}>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
            >
              + New document
            </button>
          </form>
        </div>

        {docs.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-black/15 dark:border-white/15 p-12 text-center">
            <h2 className="text-lg font-semibold">No documents yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
              Create your first document. It works offline — your edits are
              saved in your browser before they ever touch the network.
            </p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {docs.map((doc) => (
              <li key={doc.id} className="group relative">
                <Link
                  href={`/documents/${doc.id}`}
                  className="block rounded-xl border border-black/10 dark:border-white/10 p-5 hover:border-black/25 dark:hover:border-white/25 hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium truncate">{doc.title}</span>
                    <RoleBadge role={doc.role} />
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">
                    Updated {formatDate(doc.updatedAt)}
                  </p>
                </Link>
                {doc.role === "owner" && (
                  <DeleteDocButton documentId={doc.id} title={doc.title} />
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </>
  );
}

function RoleBadge({ role }: { role: "owner" | "editor" | "viewer" }) {
  const styles = {
    owner:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    editor:
      "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
    viewer:
      "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-400",
  } as const;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[role]}`}
    >
      {role}
    </span>
  );
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
