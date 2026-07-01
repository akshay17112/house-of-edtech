import Link from "next/link";
import { Footer } from "@/components/footer";
import { site } from "@/lib/site";

const features = [
  {
    title: "Works fully offline",
    body: "Your browser is the source of truth. Open, edit, and close documents with zero network requests blocking the UI — on a plane, in a tunnel, anywhere.",
    badge: "Local-first",
  },
  {
    title: "Conflict-free merging",
    body: "Edit the same document offline as someone else; on reconnect both sets of changes merge deterministically with no data loss — guaranteed by a CRDT, not a guess.",
    badge: "Deterministic sync",
  },
  {
    title: "Safe time travel",
    body: "Capture named versions, browse the timeline, and restore any past state — without corrupting the live document for other active collaborators.",
    badge: "Version history",
  },
];

export default function Home() {
  return (
    <>
      <header className="mx-auto w-full max-w-5xl px-6 py-5 flex items-center justify-between">
        <span className="font-semibold tracking-tight">{site.name}</span>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/login"
            className="rounded-md px-3 py-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 pt-16 pb-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-black/10 dark:border-white/15 px-3 py-1 text-xs font-medium text-neutral-500">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Offline-ready · Real-time · Conflict-free
          </span>
          <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight text-balance">
            Collaborative documents that never lose your work.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-neutral-600 dark:text-neutral-400 text-pretty">
            A local-first editor built on a CRDT. Type offline, sync when you
            reconnect, and merge concurrent edits deterministically — with full
            version history and granular access control.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
            >
              Start writing
            </Link>
            <a
              href="#features"
              className="rounded-md border border-black/10 dark:border-white/15 px-5 py-2.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              How it works
            </a>
          </div>
        </section>

        <section
          id="features"
          className="mx-auto max-w-5xl px-6 pb-24 grid gap-5 sm:grid-cols-3"
        >
          {features.map((f) => (
            <article
              key={f.title}
              className="rounded-xl border border-black/10 dark:border-white/10 p-6 bg-black/[0.015] dark:bg-white/[0.02]"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
                {f.badge}
              </span>
              <h2 className="mt-2 text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {f.body}
              </p>
            </article>
          ))}
        </section>
      </main>

      <Footer />
    </>
  );
}
