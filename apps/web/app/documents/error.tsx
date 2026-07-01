"use client";

export default function DocumentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDbConnection = /fetch failed|database|NeonDbError|ECONN/i.test(
    error.message,
  );

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {isDbConnection
            ? "We couldn't reach the database — it may have been waking up from idle. This usually resolves in a second."
            : "An unexpected error occurred while loading your documents."}
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
