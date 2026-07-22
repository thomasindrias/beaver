import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { dark, font } from "../../theme";
import { ep, easeInOutCubic, easeOutCubic, mix, progress } from "../../lib/ease";
import { DarkScene } from "../../components/scene";
import { Camera, Glow, pulse } from "../../components/ui";
import { CSV_LINES, IconFinale, JSON_LINES, MD_LINES } from "../../components/cards";
import { Rise } from "../../components/text";
import { Particles, useImagePoints } from "../../components/particles";

export const RASTER_DURATION = 620;

/** The text wall: columns of mono data repeated to fill the frame. */
const Wall: React.FC<{ lines: string[]; tint?: string; opacity?: number }> = ({
  lines,
  tint = dark.fg,
  opacity = 1,
}) => {
  const block = lines.join("\n");
  const column = Array.from({ length: 7 }, () => block).join("\n\n");
  return (
    <div
      style={{
        position: "absolute",
        inset: "-140px -80px",
        display: "flex",
        gap: 70,
        justifyContent: "center",
        fontFamily: font.mono,
        fontSize: 19.5,
        lineHeight: 1.75,
        color: tint,
        whiteSpace: "pre",
        opacity,
      }}
    >
      {[0, 1, 2].map((c) => (
        <div key={c} style={{ transform: `translateY(${c === 1 ? -90 : 0}px)` }}>
          {column}
        </div>
      ))}
    </div>
  );
};

export const RasterToVector: React.FC = () => {
  const frame = useCurrentFrame();

  const SWEEP = { from: 64, to: 210 };
  const LINE1 = 150;
  const LINE2 = 196;
  const MORPH_CSV = 300;
  const MORPH_JSON = 372;
  const LINES_OUT = 300;
  const DISSOLVE = 452;
  const FINALE = 500;

  const sweep = ep(frame, SWEEP.from, SWEEP.to, easeInOutCubic);
  const sweepX = mix(-80, 2000, sweep);
  const wallFade = 1 - ep(frame, DISSOLVE, DISSOLVE + 26, easeInOutCubic);

  const wallLines = frame < MORPH_CSV ? MD_LINES : frame < MORPH_JSON ? CSV_LINES : JSON_LINES;

  const ICON = { x: 690, y: 396, size: 200 };
  const iconPts = useImagePoints("beaver-icon.png", { x: ICON.x, y: ICON.y, w: ICON.size, h: ICON.size }, 5);

  return (
    <DarkScene>
      <Audio src={staticFile("audio/RasterToVector.wav")} />
      <Camera
        zoom={mix(1.12, 1.0, ep(frame, 0, SWEEP.to, easeInOutCubic)) * mix(1, 1.07, ep(frame, MORPH_CSV - 30, DISSOLVE, easeInOutCubic))}
        rotY={mix(0, -3.2, ep(frame, MORPH_CSV - 30, DISSOLVE, easeInOutCubic))}
      >
        <AbsoluteFill style={{ opacity: wallFade }}>
          {/* raster state: soft, dim, unselectable */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              filter: "blur(3.4px) saturate(0.75)",
              opacity: 0.5,
              clipPath: `inset(0 0 0 ${Math.max(0, (sweepX / 1920) * 100)}%)`,
            }}
          >
            <Wall lines={wallLines} tint={dark.mutedFg} />
          </div>
          {/* vector state: crisp, warm-white, revealed behind the scanline */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              clipPath: `inset(0 ${Math.max(0, 100 - (sweepX / 1920) * 100)}% 0 0)`,
            }}
          >
            <Wall lines={wallLines} tint={dark.fg} opacity={0.92} />
          </div>
          {/* the scanline */}
          {sweep > 0 && sweep < 1 && (
            <div
              style={{
                position: "absolute",
                top: -60,
                bottom: -60,
                left: sweepX - 3,
                width: 6,
                background: dark.amber,
                borderRadius: 99,
                boxShadow: `0 0 34px 6px ${dark.amberDim(55)}, 0 0 120px 30px ${dark.amberDim(20)}`,
              }}
            />
          )}
        </AbsoluteFill>
      </Camera>

      {/* dark plate behind the headline so it reads over the wall */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 55% 30% at 50% 50%, rgba(0,0,0,0.72) 0%, transparent 70%)`,
          opacity: ep(frame, LINE1 - 10, LINE1 + 6, easeOutCubic) * (1 - ep(frame, LINES_OUT + 40, LINES_OUT + 60, easeInOutCubic)),
        }}
      />
      <div style={{ opacity: 1 - ep(frame, LINES_OUT + 40, LINES_OUT + 60, easeInOutCubic) }}>
        <Rise
          start={LINE1}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 448,
            textAlign: "center",
            fontFamily: font.sans,
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: dark.fg,
          }}
        >
          If you can see it,
        </Rise>
        <Rise
          start={LINE2}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 542,
            textAlign: "center",
            fontFamily: font.sans,
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: dark.amber,
          }}
        >
          you can have it.
        </Rise>
      </div>

      {/* dissolve into the icon */}
      {frame >= DISSOLVE && frame <= FINALE + 8 && (
        <Particles
          width={1920}
          height={1080}
          frame={frame}
          mode="dissolve"
          rect={{ x: 360, y: 200, w: 1200, h: 660 }}
          t={ep(frame, DISSOLVE, FINALE, easeInOutCubic)}
          fade={1 - progress(frame, FINALE - 6, FINALE + 8)}
          seed={17}
          maxCount={700}
          spread={340}
        />
      )}
      {frame >= FINALE - 6 && iconPts && (
        <Particles
          width={1920}
          height={1080}
          frame={frame}
          mode="assemble"
          points={iconPts}
          t={ep(frame, FINALE, FINALE + 32, easeInOutCubic)}
          fade={1 - progress(frame, FINALE + 28, FINALE + 42)}
          seed={19}
          spread={430}
          maxCount={1100}
        />
      )}
      {frame >= FINALE + 24 && (
        <IconFinale
          start={FINALE + 24}
          iconAt={ICON}
          tagline="Stop retyping your screen."
          subline="Free and open source · macOS"
        />
      )}
      <Glow x={960} y={496} r={520} opacity={pulse(frame, FINALE + 24, 30) * 0.7} />
    </DarkScene>
  );
};
