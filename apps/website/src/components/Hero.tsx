import { useCallback, useState } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { BrandMark } from "./BrandMark";
import { IntroVideo } from "./IntroVideo";
import { SettledHero } from "./SettledHero";

type Phase = "intro" | "settled";
const INTRO_SEEN_KEY = "beaver:intro-seen";

function hasSeenIntro() {
  try {
    return window.sessionStorage.getItem(INTRO_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

function markIntroSeen() {
  try {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, "true");
  } catch {
    // If sessionStorage is unavailable, keep the intro behavior unchanged.
  }
}

export function Hero() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [skipIntro] = useState(hasSeenIntro);
  const [phase, setPhase] = useState<Phase>(
    prefersReducedMotion || skipIntro ? "settled" : "intro",
  );
  // Stable reference: IntroVideo's mount effect depends on this, and we
  // don't want it re-firing play() on the settle re-render.
  const settle = useCallback(() => {
    markIntroSeen();
    setPhase("settled");
  }, []);

  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[var(--color-page-background)]">
      <BrandMark size={32} decorative className="absolute left-6 top-6 z-10" />
      {!prefersReducedMotion && !skipIntro && (
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
