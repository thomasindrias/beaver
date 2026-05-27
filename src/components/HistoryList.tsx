import { useCallback } from "react";
import type { Capture } from "../types";
import { CaptureEntry } from "./CaptureEntry";

interface Props { captures: Capture[] }

export function HistoryList({ captures }: Props) {
  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  if (captures.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 13 }}>
        No captures yet —{" "}
        <kbd style={{ background: "#222", padding: "1px 5px", borderRadius: 3, color: "#888" }}>⌘⇧D</kbd>{" "}
        anywhere to start.
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", maxHeight: 460 }}>
      {captures.map(c => <CaptureEntry key={c.id} capture={c} onCopy={handleCopy} />)}
    </div>
  );
}
