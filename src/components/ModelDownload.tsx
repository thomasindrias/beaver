import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertCircle, Download } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

interface PullProgress { status: string; completed?: number; total?: number }
interface Props { onComplete: () => void }

export function ModelDownload({ onComplete }: Props) {
  const [progress, setProgress] = useState<PullProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    setError(null);

    listen<string>("model-pull-progress", (event) => {
      try {
        const data: PullProgress = JSON.parse(event.payload);
        setProgress(data);
        if (data.status === "success") onComplete();
      } catch {}
    }).then((fn) => { unlisten = fn; });

    invoke("pull_model").catch((e) => setError(String(e)));

    return () => unlisten?.();
  }, [onComplete, attempt]);

  const pct =
    progress?.total != null && progress.completed != null
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  if (error) {
    return (
      <div className="flex w-full max-w-[340px] flex-col items-center text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-destructive/12 text-destructive">
          <AlertCircle className="size-7" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Download interrupted</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Osprey couldn't reach the model. Check your connection and try again.
        </p>
        <Button className="mt-6 w-full" onClick={() => setAttempt((a) => a + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  const statusLabel = formatStatus(progress?.status);

  return (
    <div className="flex w-full max-w-[340px] flex-col items-center text-center">
      <Logo size={56} live className="mb-5" />
      <h2 className="text-lg font-semibold tracking-tight">Setting up your local AI</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Downloading a ~2&nbsp;GB vision model. This is the only time Osprey needs the
        internet — everything after runs offline.
      </p>

      <div className="mt-7 w-full">
        <Progress value={pct} className="h-1.5" />
        <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Download className="size-3.5" />
            {statusLabel}
          </span>
          <span className="tabular-nums">{pct > 0 ? `${pct}%` : "starting…"}</span>
        </div>
      </div>
    </div>
  );
}

function formatStatus(status?: string): string {
  if (!status) return "Connecting…";
  if (status.startsWith("pulling")) return "Downloading model";
  if (status.includes("verifying")) return "Verifying";
  if (status.includes("manifest")) return "Fetching manifest";
  if (status === "success") return "Done";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
