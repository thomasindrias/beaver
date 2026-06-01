import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  className?: string;
  /** Animate the focal point with a soft amber pulse. */
  live?: boolean;
}

/**
 * Beaver mark — a focus reticle wrapped around a sharp amber eye.
 * Reads as "precise capture": the bird's gaze locking onto a target.
 */
export function Logo({ size = 40, className, live = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      {/* focus brackets */}
      <g
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        className="text-muted-foreground/70"
      >
        <path d="M6 15V9.5A3.5 3.5 0 0 1 9.5 6H15" />
        <path d="M33 6h5.5A3.5 3.5 0 0 1 42 9.5V15" />
        <path d="M42 33v5.5a3.5 3.5 0 0 1-3.5 3.5H33" />
        <path d="M15 42H9.5A3.5 3.5 0 0 1 6 38.5V33" />
      </g>

      {/* eye ring */}
      <circle
        cx="24"
        cy="24"
        r="10.5"
        stroke="var(--primary)"
        strokeWidth={2.4}
        className={cn(live && "animate-beaver-pulse")}
      />

      {/* sharp pupil — the beaver's gaze */}
      <path
        d="M24 18.5 29.5 24 24 29.5 18.5 24Z"
        fill="var(--primary)"
        className={cn(live && "animate-beaver-pulse")}
      />
    </svg>
  );
}
