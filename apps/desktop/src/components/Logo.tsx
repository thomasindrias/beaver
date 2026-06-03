import { BrandMark, cn } from "@beaver/ui";

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
    <BrandMark
      size={size}
      decorative
      className={cn(live && "animate-beaver-pulse", className)}
    />
  );
}
