import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, MonitorUp } from "lucide-react";

interface StatusReport {
  phase: string;
  progress: number | null;
  detail?: string | null;
}

// Thin banner under the popover header for the two states a user must act on:
// missing Screen Recording permission and a failed model setup. Polls while
// visible; disappears once everything is healthy.
export function StatusBanner() {
  const [granted, setGranted] = useState(true);
  const [status, setStatus] = useState<StatusReport | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [ok, s] = await Promise.all([
          invoke<boolean>("screen_permission_granted"),
          invoke<StatusReport>("mlx_status"),
        ]);
        if (!active) return;
        setGranted(ok);
        setStatus(s);
        if (ok && s.phase === "ready") return; // healthy — stop polling
      } catch {
        // backend hiccup — keep polling
      }
      if (active) timer = setTimeout(poll, 2000);
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const retry = () => {
    invoke("retry_setup").catch(console.error);
  };

  if (!granted) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
        <MonitorUp className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">Screen Recording is off — captures won't work.</span>
        <button
          onClick={() => invoke("open_screen_recording_settings").catch(console.error)}
          className="shrink-0 rounded-md bg-amber-500/20 px-2 py-1 font-medium hover:bg-amber-500/30"
        >
          Open Settings
        </button>
      </div>
    );
  }

  if (status?.phase === "error") {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
        <AlertCircle className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          {status.detail ?? "Beaver's on-device model isn't running."}
        </span>
        <button
          onClick={retry}
          className="shrink-0 rounded-md bg-destructive/20 px-2 py-1 font-medium hover:bg-destructive/30"
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
}
