import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BeaverAnimation } from "./BeaverAnimation";

interface Props { onComplete: () => void }

type Phase = "preparing" | "starting" | "downloading" | "loading" | "ready" | "error";

export function formatPhase(phase: string): string {
  switch (phase) {
    case "preparing": return "Preparing environment…";
    case "starting": return "Starting…";
    case "downloading": return "Downloading model…";
    case "loading": return "Loading model…";
    case "ready": return "Ready";
    default: return "Setting up…";
  }
}

interface StatusReport {
  phase: Phase;
  progress: number | null;
}

export function ModelDownload({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("preparing");
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const status = await invoke<StatusReport>("mlx_status");
        if (!active) return;
        setPhase(status.phase);
        setProgress(status.progress);
        if (status.phase === "ready") {
          onComplete();
          return;
        }
        if (status.phase === "error") return; // stop polling; show error UI
      } catch {
        // server not up yet — keep polling
      }
      timer = setTimeout(poll, 1000);
    };

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [onComplete]);

  if (phase === "error") {
    return (
      <div className="flex w-full max-w-[340px] flex-col items-center text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-destructive/12 text-destructive">
          <AlertCircle className="size-7" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Setup didn't finish</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Beaver couldn't finish setting up its local AI. Check your internet
          connection and restart Beaver to try again.
        </p>
        <Button className="mt-6 w-full" onClick={onComplete}>
          Continue anyway
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[340px] flex-col items-center text-center">
      <BeaverAnimation mood="singing" size={128} className="mb-2 drop-shadow-sm" />
      <h2 className="text-lg font-semibold tracking-tight">Setting up your local AI</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        First run downloads a ~3&nbsp;GB vision model and prepares an on-device
        environment. This is the only time Beaver needs the internet — everything
        after runs offline.
      </p>

      <div className="mt-7 w-full">
        {progress != null ? (
          <div
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        ) : (
          <div className="h-1.5 w-full animate-pulse rounded-full bg-primary/60" />
        )}
        <div className="mt-2.5 flex items-center justify-center text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Download className="size-3.5" />
            {formatPhase(phase)}
            {progress != null && ` ${Math.round(progress * 100)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}
