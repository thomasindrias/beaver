import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface PullProgress { status: string; completed?: number; total?: number }
interface Props { onComplete: () => void }

export function ModelDownload({ onComplete }: Props) {
  const [progress, setProgress] = useState<PullProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<string>("model-pull-progress", (event) => {
      try {
        const data: PullProgress = JSON.parse(event.payload);
        setProgress(data);
        if (data.status === "success") onComplete();
      } catch {}
    }).then(fn => { unlisten = fn; });

    invoke("pull_model").catch(e => setError(String(e)));

    return () => unlisten?.();
  }, [onComplete]);

  const pct = progress?.total && progress.completed
    ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div style={{ maxWidth: 400 }}>
      <h2 style={{ fontWeight: 600, marginBottom: 8, fontSize: 20 }}>Downloading your local AI.</h2>
      <p style={{ color: "#777", fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
        About 2 GB — this is the last time we'll need the internet.
      </p>
      <div style={{ background: "#222", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ background: "#f59e0b", height: "100%", width: `${pct}%`, transition: "width 0.4s ease" }} />
      </div>
      {progress && (
        <p style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
          {progress.status}{pct > 0 ? ` — ${pct}%` : ""}
        </p>
      )}
      {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>Something went wrong: {error}</p>}
    </div>
  );
}
