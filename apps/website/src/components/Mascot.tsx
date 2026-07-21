import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { brandAssets } from "../constants";

export type MascotMood =
  | "wave"
  | "crying"
  | "playful"
  | "angry"
  | "sleepy"
  | "happy"
  | "love";

interface MascotProps {
  mood: MascotMood;
  alt: string;
  className?: string;
  /** Hero-only: load immediately instead of lazily. */
  eager?: boolean;
}

export function Mascot({ mood, alt, className, eager = false }: MascotProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const src = prefersReducedMotion
    ? brandAssets.head
    : `/beaver-animations/beaver-${mood}.webp`;
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      draggable={false}
      className={["select-none", className].filter(Boolean).join(" ")}
    />
  );
}
