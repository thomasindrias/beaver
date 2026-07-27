import React, { useEffect, useMemo, useRef, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { clamp01, easeInOutCubic, mix } from "../lib/ease";
import { mulberry32 } from "../lib/rng";

export interface Pt {
  x: number;
  y: number;
}

/** Sample opaque pixels of an image into a point cloud (page space).
 * Deterministic: fixed grid step over a fixed raster. */
export const useImagePoints = (
  src: string,
  target: { x: number; y: number; w: number; h: number },
  step = 6,
): Pt[] | null => {
  const [points, setPoints] = useState<Pt[] | null>(null);
  const [handle] = useState(() => delayRender(`sample ${src}`));
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = staticFile(src);
    img.onload = () => {
      const raster = 220;
      const c = document.createElement("canvas");
      c.width = raster;
      c.height = raster;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, raster, raster);
      const data = ctx.getImageData(0, 0, raster, raster).data;
      const pts: Pt[] = [];
      for (let py = 0; py < raster; py += step) {
        for (let px = 0; px < raster; px += step) {
          if (data[(py * raster + px) * 4 + 3] > 140) {
            pts.push({
              x: target.x + (px / raster) * target.w,
              y: target.y + (py / raster) * target.h,
            });
          }
        }
      }
      setPoints(pts);
      continueRender(handle);
    };
    img.onerror = () => continueRender(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return points;
};

interface Particle {
  home: Pt;
  away: Pt;
  drift: Pt;
  size: number;
  phase: number;
}

/** One deterministic particle system, two directions:
 * mode "dissolve": particles sit on a grid inside `rect` and scatter as t 0->1.
 * mode "assemble": particles fly from scatter into `points` as t 0->1.
 * Rendered on a canvas; amber with soft shadow bloom. */
export const Particles: React.FC<{
  width: number;
  height: number;
  t: number;
  fade?: number;
  seed?: number;
  mode: "dissolve" | "assemble";
  rect?: { x: number; y: number; w: number; h: number };
  points?: Pt[];
  color?: string;
  maxCount?: number;
  spread?: number;
  frame: number;
}> = ({
  width,
  height,
  t,
  fade = 1,
  seed = 1,
  mode,
  rect,
  points,
  color = "247, 195, 108",
  maxCount = 900,
  spread = 260,
  frame,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);

  const parts = useMemo<Particle[]>(() => {
    const rnd = mulberry32(seed);
    const out: Particle[] = [];
    if (mode === "dissolve" && rect) {
      const cols = Math.round(Math.sqrt((maxCount * rect.w) / Math.max(1, rect.h)));
      const rows = Math.max(1, Math.round(maxCount / Math.max(1, cols)));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const home = {
            x: rect.x + ((c + 0.5) / cols) * rect.w + (rnd() - 0.5) * 6,
            y: rect.y + ((r + 0.5) / rows) * rect.h + (rnd() - 0.5) * 6,
          };
          const ang = rnd() * Math.PI * 2;
          const dist = (0.3 + rnd() * 0.7) * spread;
          out.push({
            home,
            away: { x: home.x + Math.cos(ang) * dist, y: home.y + Math.sin(ang) * dist - spread * 0.35 },
            drift: { x: (rnd() - 0.5) * 30, y: (rnd() - 0.5) * 30 },
            size: 1.2 + rnd() * 2.4,
            phase: rnd(),
          });
        }
      }
    } else if (mode === "assemble" && points) {
      const stride = Math.max(1, Math.floor(points.length / maxCount));
      for (let i = 0; i < points.length; i += stride) {
        const home = points[i];
        const ang = rnd() * Math.PI * 2;
        const dist = (0.4 + rnd() * 0.9) * spread;
        out.push({
          home,
          away: { x: home.x + Math.cos(ang) * dist, y: home.y + Math.sin(ang) * dist },
          drift: { x: (rnd() - 0.5) * 24, y: (rnd() - 0.5) * 24 },
          size: 1.1 + rnd() * 2.2,
          phase: rnd(),
        });
      }
    }
    return out;
  }, [seed, mode, rect, points, maxCount, spread]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    if (fade <= 0 || parts.length === 0) return;
    for (const p of parts) {
      // Staggered per-particle timing gives the cloud a liquid feel.
      const local = clamp01((t - p.phase * 0.35) / 0.65);
      const e = easeInOutCubic(local);
      const toward = mode === "dissolve" ? e : 1 - e;
      const wob = Math.sin((frame * 0.05 + p.phase * 8) * Math.PI) * 3 * toward;
      const x = mix(p.home.x, p.away.x, toward) + p.drift.x * toward + wob;
      const y = mix(p.home.y, p.away.y, toward) + p.drift.y * toward;
      const alpha =
        fade * (mode === "dissolve" ? 1 - local * 0.85 : 0.25 + e * 0.75);
      ctx.fillStyle = `rgba(${color}, ${alpha})`;
      ctx.shadowColor = `rgba(${color}, 0.9)`;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [parts, t, fade, frame, width, height, mode, color]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
};
