import { useState, useCallback } from "react";
import { ModelDownload } from "./ModelDownload";

type Step = "welcome" | "download" | "ready";
interface Props { onComplete: () => void }

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const handleDownloadComplete = useCallback(() => setStep("ready"), []);

  const style: React.CSSProperties = {
    height: "100vh",
    background: "#0d0d0d",
    color: "#f5f5f5",
    fontFamily: "system-ui",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
    textAlign: "center",
  };

  if (step === "welcome") return (
    <div style={style}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🦅</div>
      <h1 style={{ fontWeight: 700, fontSize: 26, marginBottom: 10 }}>Meet Osprey.</h1>
      <p style={{ color: "#666", lineHeight: 1.7, marginBottom: 32, maxWidth: 380 }}>
        Press <kbd style={{ background: "#1f1f1f", padding: "2px 6px", borderRadius: 4 }}>⌘⇧D</kbd> anywhere,
        draw around anything on your screen, and get the data — not a screenshot.
        Fully local. Never leaves your Mac.
      </p>
      <button onClick={() => setStep("download")} style={btnStyle}>
        Get started
      </button>
    </div>
  );

  if (step === "download") return (
    <div style={style}>
      <ModelDownload onComplete={handleDownloadComplete} />
    </div>
  );

  return (
    <div style={style}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>✓</div>
      <h1 style={{ fontWeight: 700, fontSize: 26, marginBottom: 10 }}>You're set.</h1>
      <p style={{ color: "#666", lineHeight: 1.7, marginBottom: 32, maxWidth: 380 }}>
        Press <kbd style={{ background: "#1f1f1f", padding: "2px 6px", borderRadius: 4 }}>⌘⇧D</kbd> anywhere
        to capture. Click the Osprey icon in your menu bar to see your history.
      </p>
      <button onClick={onComplete} style={btnStyle}>Start using Osprey</button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#f59e0b", color: "#000", border: "none",
  padding: "10px 28px", borderRadius: 6, fontWeight: 700,
  cursor: "pointer", fontSize: 15,
};
