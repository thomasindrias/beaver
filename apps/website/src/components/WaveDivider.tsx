interface WaveDividerProps {
  flip?: boolean;
}

export function WaveDivider({ flip = false }: WaveDividerProps) {
  return (
    <svg
      className={["block h-[60px] w-full", flip ? "-scale-y-100" : ""]
        .filter(Boolean)
        .join(" ")}
      viewBox="0 0 1440 60"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0,30 C240,60 480,0 720,30 C960,60 1200,0 1440,30 L1440,60 L0,60 Z"
        fill="var(--color-river)"
      />
    </svg>
  );
}
