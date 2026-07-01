import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-black/10 dark:border-white/10 mt-auto">
      <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-500">
        <p>
          Built by{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            {site.author.name}
          </span>
        </p>
        <nav className="flex items-center gap-5" aria-label="Author links">
          <a
            href={site.author.github}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-neutral-900 dark:hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded"
          >
            GitHub
          </a>
          <a
            href={site.author.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-neutral-900 dark:hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 rounded"
          >
            LinkedIn
          </a>
        </nav>
      </div>
    </footer>
  );
}
