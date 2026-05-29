import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

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

export function ModelDownload({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("preparing");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const status = await invoke<string>("mlx_status");
        if (!active) return;
        setPhase(status as Phase);
        if (status === "ready") {
          onComplete();
          return;
        }
        if (status === "error") return; // stop polling; show error UI
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
          Osprey couldn't finish setting up its local AI. Check your internet
          connection and restart Osprey to try again.
        </p>
        <Button className="mt-6 w-full" onClick={onComplete}>
          Continue anyway
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[340px] flex-col items-center text-center">
      <Logo size={56} live className="mb-5" />
      <h2 className="text-lg font-semibold tracking-tight">Setting up your local AI</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        First run downloads a ~3&nbsp;GB vision model and prepares an on-device
        environment. This is the only time Osprey needs the internet — everything
        after runs offline.
      </p>

      <div className="mt-7 w-full">
        <div className="h-1.5 w-full animate-pulse rounded-full bg-primary/60" />
        <div className="mt-2.5 flex items-center justify-center text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Download className="size-3.5" />
            {formatPhase(phase)}
          </span>
        </div>
      </div>
    </div>
  );
}
