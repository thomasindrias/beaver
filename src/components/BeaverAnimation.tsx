export type BeaverMood =
  | "wave"
  | "singing"
  | "happy"
  | "crying"
  | "love"
  | "sleepy"
  | "playful"
  | "angry";

// Intrinsic portrait canvas of the source webp loops; width follows from it so
// the element reserves the right box before the image decodes.
const ASPECT = 299 / 323;

interface Props {
  mood: BeaverMood;
  /** Rendered height in px; width follows the portrait aspect ratio. */
  size?: number;
  className?: string;
}

/** A looping beaver mood animation from public/beaver-animations. */
export function BeaverAnimation({ mood, size = 120, className }: Props) {
  return (
    <img
      src={`/beaver-animations/beaver-${mood}.webp`}
      alt=""
      aria-hidden
      draggable={false}
      height={size}
      width={Math.round(size * ASPECT)}
      className={className}
    />
  );
}
