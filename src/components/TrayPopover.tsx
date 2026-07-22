import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Settings } from "lucide-react";
import { getSettings, openSettings } from "../lib/api";
import { useCaptures } from "../hooks/useCaptures";
import { HistoryList } from "./HistoryList";
import { Logo } from "./Logo";
import { Kbd } from "./Kbd";
import { StatusBanner } from "./StatusBanner";
import { UpdatePill } from "./UpdatePill";

export function TrayPopover() {
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const { captures, refresh } = useCaptures({ retentionDays });

  useEffect(() => {
    getSettings()
      .then(s => setRetentionDays(s.history_retention_days))
      .catch(console.error);
  }, []);

  // Captures are written by a separate overlay window into the shared SQLite
  // DB, so this window's state goes stale while it's hidden. The popover gains
  // focus every time the tray reopens it (toggle_popover -> set_focus), so a
  // re-query on focus pulls in anything captured in the meantime.
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) refresh();
    });
    return () => {
      unlisten.then(f => f());
    };
  }, [refresh]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden rounded-[18px] border border-white/10 bg-popover/55 text-popover-foreground">
      {/* Header */}
      <header className="flex items-center gap-2.5 px-4 pb-3 pt-3.5">
        <Logo size={22} />
        <span className="text-[15px] font-semibold tracking-tight">Beaver</span>
        <div className="ml-auto flex items-center gap-2">
          <UpdatePill />
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {captures.length} {captures.length === 1 ? "capture" : "captures"}
          </span>
          <button
            type="button"
            aria-label="Settings"
            onClick={() => openSettings().catch(console.error)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="h-px bg-border" />
      <StatusBanner />

      {/* History */}
      <div className="min-h-0 flex-1">
        <HistoryList captures={captures} />
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-center gap-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        <Kbd>⌘</Kbd>
        <Kbd>⇧</Kbd>
        <Kbd>D</Kbd>
        <span className="ml-1">to capture anywhere</span>
      </footer>
    </div>
  );
}
