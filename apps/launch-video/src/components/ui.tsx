import React from "react";
import { useCurrentFrame } from "remotion";
import {
  AlignLeft,
  Braces,
  Check,
  FileText,
  Loader2,
  Sparkles,
  Table,
} from "lucide-react";
import { dark, font } from "../theme";
import { ep, easeOutBack, easeOutCubic, mix, progress } from "../lib/ease";

/** Selection rectangle replica of CaptureOverlay: amber ring, corner
 * ticks, mono W×H readout, and the punched-out dim around it.
 * `draw` 0..1 animates the marquee from the top-left anchor. */
export const SelectionBox: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  draw: number;
  dim?: number;
  showReadout?: boolean;
  glow?: number;
}> = ({ x, y, w, h, draw, dim = 0.45, showReadout = true, glow = 0 }) => {
  const cw = Math.max(8, w * draw);
  const ch = Math.max(8, h * draw);
  if (draw <= 0) return null;
  const tick = (pos: React.CSSProperties, r: string) => (
    <span
      style={{
        position: "absolute",
        width: 12,
        height: 12,
        borderColor: dark.amber,
        borderStyle: "solid",
        borderWidth: 0,
        borderRadius: r,
        ...pos,
      }}
    />
  );
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: cw,
        height: ch,
        borderRadius: 3,
        boxShadow: `0 0 0 2px ${dark.amber}, 0 0 0 100vmax rgba(0,0,0,${dim}), 0 0 ${24 + glow * 40}px ${dark.amberDim(20 + glow * 25)}`,
      }}
    >
      {tick({ left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 }, "3px 0 0 0")}
      {tick({ right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 }, "0 3px 0 0")}
      {tick({ left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 }, "0 0 0 3px")}
      {tick({ right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 }, "0 0 3px 0")}
      {showReadout && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: ch > 76 ? 12 : ch + 16,
            background: "rgba(0,0,0,0.8)",
            borderRadius: 12,
            padding: "3px 10px",
            fontFamily: font.mono,
            fontSize: 22,
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
            color: dark.amber,
            whiteSpace: "nowrap",
          }}
        >
          {Math.round(cw)} × {Math.round(ch)}
        </div>
      )}
    </div>
  );
};

/** Crosshair guide lines that meet at (cx, cy), amber at 40%. */
export const Crosshair: React.FC<{ cx: number; cy: number; opacity: number }> = ({
  cx,
  cy,
  opacity,
}) => (
  <>
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: cy,
        height: 2,
        background: dark.amberDim(40),
        opacity,
      }}
    />
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: cx,
        width: 2,
        background: dark.amberDim(40),
        opacity,
      }}
    />
  </>
);

const FORMAT_ICONS = [FileText, Table, Braces, AlignLeft] as const;

/** The anchored HUD pill, transcribed from CaptureHud.tsx. Modes map to
 * the app's states; `chipActive` is the active format index. All motion
 * is driven by the parent via plain numbers. */
export const HudPill: React.FC<{
  mode: "processing" | "copied" | "chips";
  message?: string;
  spinnerAngle?: number;
  chipActive?: number;
  appear?: number;
  scale?: number;
}> = ({ mode, message, spinnerAngle = 0, chipActive = 0, appear = 1, scale = 1 }) => {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    border: `1.5px solid ${dark.whiteDim(10)}`,
    background: dark.pillBg,
    boxShadow: `0 25px 50px -12px rgba(0,0,0,0.6), 0 0 30px ${dark.amberDim(8)}`,
    fontFamily: font.sans,
    fontSize: 22,
    fontWeight: 500,
    color: "white",
    opacity: appear,
    transform: `scale(${mix(0.86, scale, easeOutBack(appear))})`,
    backdropFilter: "blur(12px)",
  };
  if (mode === "processing") {
    return (
      <div style={{ ...base, gap: 12, padding: "12px 20px" }}>
        <Loader2
          size={26}
          color={dark.amber}
          style={{ transform: `rotate(${spinnerAngle}deg)` }}
        />
        <span style={{ whiteSpace: "nowrap" }}>{message}</span>
      </div>
    );
  }
  if (mode === "copied") {
    return (
      <div style={{ ...base, gap: 12, padding: "12px 20px" }}>
        <Check size={26} color={dark.amber} strokeWidth={3} />
        <span style={{ whiteSpace: "nowrap" }}>{message ?? "Copied as table"}</span>
      </div>
    );
  }
  return (
    <div style={{ ...base, gap: 3, padding: "7px 10px" }}>
      {FORMAT_ICONS.map((Icon, i) => {
        const active = i === chipActive;
        return (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 40,
              width: 46,
              borderRadius: 999,
              background: active ? dark.amber : "transparent",
              color: active ? dark.zinc900 : dark.zinc400,
            }}
          >
            <Icon size={26} />
          </span>
        );
      })}
      <span
        style={{
          margin: "0 7px",
          height: 22,
          width: 1.5,
          background: dark.whiteDim(15),
        }}
      />
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: 40,
          width: 46,
          color: dark.zinc400,
        }}
      >
        <Sparkles size={26} />
      </span>
    </div>
  );
};

/** Keycap replica of Kbd.tsx, scaled for video. `press` 0..1 pushes it down. */
export const Keycap: React.FC<{
  label: string;
  appear: number;
  press?: number;
  size?: number;
}> = ({ label, appear, press = 0, size = 84 }) => (
  <span
    style={{
      display: "inline-flex",
      height: size,
      minWidth: size,
      alignItems: "center",
      justifyContent: "center",
      padding: "0 20px",
      borderRadius: 14,
      border: `2px solid ${dark.whiteDim(12)}`,
      background: dark.secondary,
      color: dark.fg,
      fontFamily: font.sans,
      fontSize: size * 0.42,
      fontWeight: 500,
      boxShadow: `0 ${mix(6, 1, press)}px 0 rgba(0,0,0,0.5), 0 0 24px ${dark.amberDim(press * 30)}`,
      opacity: appear,
      transform: `translateY(${mix(14, 0, easeOutBack(appear)) + press * 5}px) scale(${mix(0.92, 1, easeOutBack(appear))})`,
    }}
  >
    {label}
  </span>
);

/** Dead-flat network meter: the quiet witness in the privacy beats. */
export const NetworkMeter: React.FC<{
  appear: number;
  width?: number;
  sweep: number;
  label?: string;
}> = ({ appear, width = 300, sweep, label = "network" }) => {
  const h = 64;
  return (
    <div
      style={{
        width,
        borderRadius: 12,
        border: `1.5px solid ${dark.border}`,
        background: dark.popover,
        padding: "12px 16px 10px",
        opacity: appear,
        fontFamily: font.mono,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 16,
          color: dark.mutedFg,
          marginBottom: 6,
        }}
      >
        <span>{label}</span>
        <span style={{ color: dark.amber }}>0 B</span>
      </div>
      <svg width={width - 34} height={h * 0.5}>
        <line
          x1={0}
          y1={h * 0.35}
          x2={(width - 34) * sweep}
          y2={h * 0.35}
          stroke={dark.amber}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

/** Soft radial glow blob; the only bloom primitive. */
export const Glow: React.FC<{
  x: number;
  y: number;
  r: number;
  color?: string;
  opacity: number;
}> = ({ x, y, r, color, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: x - r,
      top: y - r,
      width: r * 2,
      height: r * 2,
      borderRadius: "50%",
      background: `radial-gradient(circle, ${color ?? dark.amberDim(45)} 0%, transparent 65%)`,
      opacity,
      pointerEvents: "none",
    }}
  />
);

/** Continuous camera: scale + translate + optional 3D tilt around center. */
export const Camera: React.FC<{
  zoom?: number;
  x?: number;
  y?: number;
  rotX?: number;
  rotY?: number;
  children: React.ReactNode;
}> = ({ zoom = 1, x = 0, y = 0, rotX = 0, rotY = 0, children }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      perspective: 1600,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${zoom}) translate(${x}px, ${y}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
        transformStyle: "preserve-3d",
      }}
    >
      {children}
    </div>
  </div>
);

/** Frame-driven spinner angle helper for Loader2 replicas. */
export const useSpinner = (speed = 9): number => useCurrentFrame() * speed;

/** Bar-line flash: a fast bloom that decays over `len` frames after `at`. */
export const pulse = (frame: number, at: number, len = 14): number => {
  const t = progress(frame, at, at + len);
  return t <= 0 || t >= 1 ? 0 : (1 - t) * ep(frame, at, at + 3, easeOutCubic);
};
