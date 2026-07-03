import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UpdateInfo {
  version: string;
  url: string;
}

// Small header pill when a newer release exists. The backend rate-limits the
// underlying network call to once a day; rendering this is otherwise free.
export function UpdatePill() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    invoke<UpdateInfo | null>("check_for_update")
      .then(setUpdate)
      .catch(() => {});
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
