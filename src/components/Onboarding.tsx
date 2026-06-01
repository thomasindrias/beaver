import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Scan, Sparkles, Lock, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BeaverAnimation } from "./BeaverAnimation";
import { Kbd } from "./Kbd";
import { ModelDownload } from "./ModelDownload";

type Step = "welcome" | "download" | "ready";

// Time the "You're all set" screen stays up before we close onboarding and pop
// open the menu-bar window, so the user sees where Beaver now lives.
export const READY_DWELL_MS = 2000;

const FEATURES = [
  { icon: Scan, title: "Draw, don't screenshot", body: "Select any region — get the data inside, not a picture." },
  { icon: Sparkles, title: "Structured by AI", body: "Tables, code and lists come out clean and ready to paste." },
  { icon: Lock, title: "Fully on-device", body: "Your screen never leaves your Mac. No cloud, no accounts." },
];

export function Onboarding() {
  const [step, setStep] = useState<Step>("welcome");
  const handleDownloadComplete = useCallback(() => setStep("ready"), []);

  // Closes the onboarding window and opens the popover at the menu bar.
  const finish = useCallback(() => {
    invoke("finish_onboarding").catch(console.error);
  }, []);

  useEffect(() => {
    if (step !== "ready") return;
    const t = setTimeout(finish, READY_DWELL_MS);
    return () => clearTimeout(t);
  }, [step, finish]);

  return (
    <div className="relative flex h-screen w-full flex-col bg-background px-9 py-8 text-foreground">
      {/* The window is frameless (overlay title bar), so the webview covers the
          native drag area. This strip gives back a title-bar-height handle to
          move the window; it sits over only the empty top padding. */}
      <div
        data-tauri-drag-region
        className="absolute inset-x-0 top-0 z-20 h-11"
      />
      {step === "welcome" && (
        <div key="welcome" className="animate-rise flex flex-1 flex-col">
          <div className="flex flex-col items-center text-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute size-20 rounded-full bg-primary/10 blur-2xl" />
              <BeaverAnimation
                mood="wave"
                size={96}
                className="relative drop-shadow-sm"
              />
            </div>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight">
              Meet <span className="text-primary">Beaver</span>
            </h1>
            <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-muted-foreground">
              Capture the data on your screen — not a screenshot of it.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-tight">{title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-6">
            <Button size="lg" className="w-full" onClick={() => setStep("download")}>
              Get started
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === "download" && (
        <div key="download" className="animate-rise flex flex-1 flex-col items-center justify-center text-center">
          <ModelDownload onComplete={handleDownloadComplete} />
        </div>
      )}

      {step === "ready" && (
        <div key="ready" className="animate-rise flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/12">
            <Check className="size-8 text-primary" strokeWidth={2.5} />
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight">You're all set</h1>
          <p className="mt-3 max-w-[320px] text-sm leading-relaxed text-muted-foreground">
            Press <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>D</Kbd> anywhere to capture. Find your
            history any time from the <span className="text-foreground">Beaver</span> icon in
            your menu bar.
          </p>
          <Button size="lg" className="mt-8 w-full" onClick={finish}>
            Start using Beaver
          </Button>
        </div>
      )}
    </div>
  );
}
