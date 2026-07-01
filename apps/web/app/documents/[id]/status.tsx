"use client";

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
