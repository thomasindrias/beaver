import { useState, useEffect, type ReactElement } from "react";
import { Check, TriangleAlert } from "lucide-react";
import type { AppState } from "../types";
import { Logo } from "./Logo";

// On-brand loading copy: a busy beaver gnawing your pixels into a tidy dam of
// data. Kept short and silly; the starting line is randomized so the joke
// doesn't get stale.
export const LOADING_MESSAGES = [
  "Chucking wood…",
  "Building the dam…",
  "What the dam…",
  "Gnawing through…",
  "Hauling logs…",
  "Packing it tight…",
  "Damming it up…",
  "Logging on…",
  "Dam near done…",
  "Busy as a beaver…",
  "Felling some trees…",
  "Stacking the sticks…",
  "Chewing the data…",
  "Sealing the leaks…",
  "Slapping some tails…",
  "Working the woodpile…",
  "Patching the dam…",
  "Whittling it down…",
  "Mudding the cracks…",
  "Hold my dam…",
  "Gnaw or never…",
  "Timber incoming…",
  "Stockpiling lumber…",
  "Dam, that's a lot…",
  "Rerouting the river…",
  "Building back beaver…",
  "Wood you wait a sec…",
  "Splinter by splinter…",
  "Chiselling the bark…",
  "Flooding the zone…",
  "Tail-slapping the bugs…",
  "Lodging a complaint…",
  "Branching out…",
  "Knee-deep in twigs…",
  "Damn fine work…",
  "Eager beaver mode…",
  "Plugging the gaps…",
  "Sawing it off…",
  "Gnashing the pixels…",
  "One more log…",
];

// How long each loading line stays up before the next one.
export const MESSAGE_ROTATE_MS = 1200;

// Where the bubble sits relative to the cursor — just below-right, Figma-style,
// so it trails the pointer without covering what's under it.
const OFFSET_X = 16;
const OFFSET_Y = 20;

interface Point {
  x: number;
  y: number;
}

interface Props {
  state: AppState;
  origin: Point;
}

// A small bubble that rides the cursor while a capture is processed. It stays
// purely informational (pointer-events-none) so it never intercepts clicks.
export function CursorToast({ state, origin }: Props) {
  const [pos, setPos] = useState<Point>(origin);
  const [msgIndex, setMsgIndex] = useState(
    () => Math.floor(Math.random() * LOADING_MESSAGES.length)
  );

  // Follow the cursor. The host window isn't click-through (it needs the
  // move events to track), so a local listener is enough — no IPC per frame.
  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (state !== "processing") return;
    const id = setInterval(
      () => setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length),
      MESSAGE_ROTATE_MS
    );
    return () => clearInterval(id);
  }, [state]);

  if (state === "idle") return null;

  const { icon, message } = render(state, msgIndex);

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: pos.x + OFFSET_X, top: pos.y + OFFSET_Y }}
    >
      <div
        key={state}
        className="animate-pop flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-2 text-[13px] font-medium text-white shadow-2xl backdrop-blur-md"
      >
        {icon}
        <span className="whitespace-nowrap">{message}</span>
      </div>
    </div>
  );
}

function render(state: AppState, msgIndex: number): { icon: ReactElement; message: string } {
  if (state === "success") {
    return {
      icon: <Check className="size-4 text-primary" strokeWidth={3} />,
      message: "Copied to clipboard.",
    };
  }
  if (state === "error") {
    return {
      icon: <TriangleAlert className="size-4 text-amber-400" />,
      message: "Dam — couldn't read that. Try again.",
    };
  }
  return {
    icon: <Logo size={16} live />,
    message: LOADING_MESSAGES[msgIndex],
  };
}
