import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { ep, easeOutCubic, progress } from "../lib/ease";
import { charsAt } from "../lib/typeon";

/** Frame-driven typed text with a block cursor. The cursor holds solid
 * while typing, then leaves shortly after the line lands so finished
 * lines don't keep blinking over each other. */
export const TypeOn: React.FC<{
  text: string;
  start: number;
  cps?: number;
  cursor?: boolean;
  cursorHold?: number;
  cursorColor?: string;
  style?: React.CSSProperties;
}> = ({ text, start, cps = 28, cursor = true, cursorHold = 16, cursorColor, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = charsAt(frame, start, cps, fps, text.length);
  const done = n >= text.length;
  const doneAt = start + Math.ceil((text.length / cps) * fps);
  if (frame < start) return null;
  return (
    <span style={style}>
      {text.slice(0, n)}
      {cursor && (!done || frame < doneAt + cursorHold) ? (
        <span
          style={{
            display: "inline-block",
            width: "0.55em",
            height: "1.05em",
            verticalAlign: "text-bottom",
            marginLeft: "0.08em",
            background: cursorColor ?? "currentColor",
            opacity: 0.85,
          }}
        />
      ) : null}
    </span>
  );
};

/** Per-glyph rise-and-fade reveal for wordmarks. */
export const LetterReveal: React.FC<{
  text: string;
  start: number;
  perLetter?: number;
  duration?: number;
  style?: React.CSSProperties;
}> = ({ text, start, perLetter = 3, duration = 14, style }) => {
  const frame = useCurrentFrame();
  return (
    <span style={{ display: "inline-block", whiteSpace: "pre", ...style }}>
      {text.split("").map((ch, i) => {
        const s = start + i * perLetter;
        const t = ep(frame, s, s + duration, easeOutCubic);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: t,
              transform: `translateY(${(1 - t) * 14}px)`,
              filter: `blur(${(1 - t) * 6}px)`,
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
};

/** Fade+rise for a whole block; the workhorse entrance. */
export const Rise: React.FC<{
  start: number;
  duration?: number;
  from?: number;
  out?: number;
  outDuration?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ start, duration = 12, from = 10, out, outDuration = 10, children, style }) => {
  const frame = useCurrentFrame();
  const tIn = ep(frame, start, start + duration, easeOutCubic);
  const tOut = out === undefined ? 0 : progress(frame, out, out + outDuration);
  return (
    <div
      style={{
        opacity: tIn * (1 - tOut),
        transform: `translateY(${(1 - tIn) * from - tOut * from * 0.6}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
