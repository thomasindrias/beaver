import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateInfo {
  version: string;
  url: string;
}

type Phase = "idle" | "downloading" | "ready";

// Small header pill when a newer release exists. Visibility still comes from
// the passive daily check (Rust side, 24h cache). Clicking now performs the
// update in place via the updater plugin; if the release carries no updater
// manifest (older releases, unsigned/local builds) or anything fails, we fall
// back to opening the release page — the pill always leads somewhere.
export function UpdatePill() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const checkPassive = () => {
      invoke<UpdateInfo | null>("check_for_update")
        .then(setUpdate)
        .catch(() => {});
    };

    checkPassive();

    // The popover window is hidden/shown for the app's whole lifetime rather
    // than recreated, so a mount-only check would never fire again. Re-check
    // on every focus; the 24h cache on the Rust side keeps the network call
    // itself throttled.
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) checkPassive();
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const startUpdate = async () => {
    if (!update || phase !== "idle") return;
    try {
      const u = await check();
      if (!u) throw new Error("no updater manifest on the latest release");
      setPhase("downloading");
      let total = 0;
      let received = 0;
      await u.downloadAndInstall(e => {
        if (e.event === "Started") {
          total = e.data.contentLength ?? 0;
        } else if (e.event === "Progress") {
          received += e.data.chunkLength;
          if (total > 0) setPercent(Math.min(100, Math.round((received / total) * 100)));
        }
      });
      setPhase("ready");
    } catch {
      setPhase("idle");
      setPercent(0);
      invoke("open_external", { url: update.url }).catch(console.error);
    }
  };

  if (!update) return null;

  const pillClass =
    "rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/25";

  if (phase === "downloading") {
    return (
      <span aria-busy="true" className={pillClass}>
        Downloading… {percent}%
      </span>
    );
  }

  if (phase === "ready") {
    return (
      <button onClick={() => relaunch().catch(console.error)} className={pillClass}>
        Restart to update
      </button>
    );
  }

  return (
    <button onClick={startUpdate} className={pillClass}>
      Update to v{update.version}
    </button>
  );
}
