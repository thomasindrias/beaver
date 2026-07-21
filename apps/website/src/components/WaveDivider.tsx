type WaveColor = "cream" | "cream-deep" | "river" | "bark";

const FILL: Record<WaveColor, string> = {
  cream: "var(--color-cream)",
  "cream-deep": "var(--color-cream-deep)",
  river: "var(--color-river)",
  bark: "var(--color-bark)",
};

interface WaveDividerProps {
  flip?: boolean;
  /** Background of the section this divider sits on top of. */
  behind: WaveColor;
  /** Color of the curve itself — the section it's transitioning into. */
  wave: WaveColor;
}

export function WaveDivider({ flip = false, behind, wave }: WaveDividerProps) {
  return (
    <svg
      className={["block h-[60px] w-full", flip ? "-scale-y-100" : ""]
        .filter(Boolean)
        .join(" ")}
      viewBox="0 0 1440 60"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect width="1440" height="60" fill={FILL[behind]} />
      <path
        d="M0,30 C240,60 480,0 720,30 C960,60 1200,0 1440,30 L1440,60 L0,60 Z"
        fill={FILL[wave]}
      />
    </svg>
  );
}
