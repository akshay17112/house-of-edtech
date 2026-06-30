"use client";

/**
 * Connection / save-state indicator.
 *
 * Two independent signals, because in a local-first app they really are
 * independent:
 *  - savedLocally: has the Yjs doc been persisted to IndexedDB? (your safety net)
 *  - connection:   the realtime link to the sync server (shared with others)
 *
 * You can be "Saved locally" while "Offline" — that's the whole point: your work
 * is safe even when the realtime link is down, and merges back on reconnect.
 */
export type Connection = "connecting" | "connected" | "disconnected";

const LIVE: Record<Connection, { label: string; dot: string; text: string }> = {
  connected: {
    label: "Live",
    dot: "bg-emerald-500",
    text: "text-neutral-500",
  },
  connecting: {
    label: "Connecting…",
    dot: "bg-amber-500 animate-pulse",
    text: "text-amber-600 dark:text-amber-400",
  },
  disconnected: {
    label: "Offline",
    dot: "bg-neutral-400",
    text: "text-neutral-500",
  },
};

export function StatusIndicator({
  savedLocally,
  connection,
}: {
  savedLocally: boolean;
  connection: Connection;
}) {
  const live = LIVE[connection];

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="flex items-center gap-1.5 text-neutral-500">
        <span
          aria-hidden
          className={`size-2 rounded-full ${
            savedLocally ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
          }`}
        />
        {savedLocally ? "Saved locally" : "Saving…"}
      </span>

      <span className={`flex items-center gap-1.5 ${live.text}`}>
        <span aria-hidden className={`size-2 rounded-full ${live.dot}`} />
        {live.label}
      </span>
    </div>
  );
}
