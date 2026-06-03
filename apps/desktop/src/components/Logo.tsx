import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  className?: string;
  /** Animate the mark with a soft amber pulse. */
  live?: boolean;
}

/**
 * Beaver mark — the app's mascot head, used everywhere the brand shows up.
 */
export function Logo({ size = 40, className, live = false }: Props) {
  return (
    <img
      src="/beaver-head.webp"
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className={cn("select-none", live && "animate-beaver-pulse", className)}
    />
  );
}
