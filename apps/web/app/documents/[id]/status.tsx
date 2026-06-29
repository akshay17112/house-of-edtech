"use client";

import { useEffect, useState } from "react";

/**
 * Connection / save-state indicator.
 *
 * Phase 2 reports two things:
 *  - savedLocally: has the Yjs doc been persisted to IndexedDB yet?
 *  - online/offline: the browser's network status (navigator.onLine).
 *
 * Real-time *server* sync status ("syncing / live") is added in Phase 3 when
 * the WebSocket provider exists. For now the headline is that your work is
 * safe locally regardless of the network.
 */
export function StatusIndicator({ savedLocally }: { savedLocally: boolean }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

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

      <span
        className={`flex items-center gap-1.5 ${
          online ? "text-neutral-500" : "text-amber-600 dark:text-amber-400"
        }`}
      >
        <span
          aria-hidden
          className={`size-2 rounded-full ${
            online ? "bg-blue-500" : "bg-neutral-400"
          }`}
        />
        {online ? "Online" : "Offline"}
      </span>
    </div>
  );
}
