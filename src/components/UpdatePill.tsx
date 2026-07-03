import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface UpdateInfo {
  version: string;
  url: string;
}

// Small header pill when a newer release exists. The backend rate-limits the
// underlying network call to once a day; rendering this is otherwise free.
export function UpdatePill() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const check = () => {
      invoke<UpdateInfo | null>("check_for_update")
        .then(setUpdate)
        .catch(() => {});
    };

    check();

    // The popover window is hidden/shown for the app's whole lifetime rather
    // than recreated, so a mount-only check would never fire again. Re-check
    // on every focus; the 24h cache on the Rust side keeps the network call
    // itself throttled.
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) check();
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  if (!update) return null;

  return (
    <button
      onClick={() => invoke("open_external", { url: update.url }).catch(console.error)}
      className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/25"
    >
      v{update.version} available
    </button>
  );
}
