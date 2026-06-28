import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { signOut } from "@/auth";
import { Footer } from "@/components/footer";

export const metadata: Metadata = { title: "Your documents" };

/**
 * Protected dashboard (Server Component).
 *
 * `requireUser()` redirects to /login if there's no session — the real gate,
 * close to the data (the proxy is only an optimistic first check).
 *
 * For now this is a placeholder confirming auth works; the document list,
 * "new document", and the editor land in the next phases.
 */
export default async function DocumentsPage() {
  const user = await requireUser();

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

      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-12">
        <div className="rounded-xl border border-dashed border-black/15 dark:border-white/15 p-12 text-center">
          <h2 className="text-lg font-semibold">You&apos;re signed in 🎉</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            Authentication and the database are working. Next up: creating
            documents and the local-first editor.
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
