import { useCallback, useState } from "react";
import { BrandMark } from "@beaver/ui";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { IntroVideo } from "./IntroVideo";
import { SettledHero } from "./SettledHero";

type Phase = "intro" | "settled";

export function Hero() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(
    prefersReducedMotion ? "settled" : "intro",
  );
  // Stable reference: IntroVideo's mount effect depends on this, and we
  // don't want it re-firing play() on the settle re-render.
  const settle = useCallback(() => setPhase("settled"), []);

  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[var(--color-page-background)]">
      <BrandMark size={32} decorative className="absolute left-6 top-6 z-10" />
      {!prefersReducedMotion && (
        <IntroVideo isSettled={phase === "settled"} onSettle={settle} />
      )}
      {phase === "settled" && (
        <div className="animate-rise">
          <SettledHero autoPlayVideo={!prefersReducedMotion} />
        </div>
      )}
    </main>
  );
}
