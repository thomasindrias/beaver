export type BeaverMood =
  | "wave"
  | "singing"
  | "happy"
  | "crying"
  | "love"
  | "sleepy"
  | "playful"
  | "angry";

interface Props {
  mood: BeaverMood;
  /** Rendered height in px; width follows each animation's own aspect ratio. */
  size?: number;
  className?: string;
}

// Each mood's webp has its own canvas (some portrait, some landscape), so we
// fix only the height and let width track the intrinsic aspect — a single
// hardcoded ratio would distort the wider moods.
/** A looping beaver mood animation from public/beaver-animations. */
export function BeaverAnimation({ mood, size = 120, className }: Props) {
  return (
    <img
      src={`/beaver-animations/beaver-${mood}.webp`}
      alt=""
      aria-hidden
      draggable={false}
      style={{ height: size, width: "auto" }}
      className={className}
    />
  );
}
