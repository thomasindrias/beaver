import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { dark, font } from "../../theme";
import { ep, easeInOutCubic, easeOutCubic, easeOutQuint, mix, progress } from "../../lib/ease";
import { DarkScene } from "../../components/scene";
import { Camera, Glow, HudPill, Keycap, NetworkMeter, SelectionBox, pulse, useSpinner } from "../../components/ui";
import { IconFinale, InvoiceDoc, Window } from "../../components/cards";
import { WordRise } from "../../components/text";
import { Particles, useImagePoints } from "../../components/particles";
import {
  ChartSlide,
  ErrorDialog,
  FINALE,
  LINE2_AT,
  LINE_AT,
  METER_AT,
  RailCard,
  ReflexAudio,
  STATION_DEFS,
  VideoCode,
} from "./shared";

export { REFLEX_DURATION } from "./shared";

// Station geometry for the 1920x1080 staging. `h` includes window chrome.
const GEO = [
  { x: 240, y: 200, w: 620, h: 505 },
  { x: 1130, y: 280, w: 640, h: 310 },
  { x: 2000, y: 250, w: 640, h: 350 },
  { x: 2880, y: 330, w: 520, h: 230 },
] as const;

export const Reflex: React.FC = () => {
  const frame = useCurrentFrame();
  const spin = useSpinner();

  // Cold open: the chord that starts the reflex.
  const chordPress = ep(frame, 42, 50, easeOutQuint);
  const chordGone = ep(frame, 54, 66, easeInOutCubic);

  // One continuous pan across the canvas; eases between stations on bar lines.
  const panT = ep(frame, 40, 420, easeInOutCubic);
  const zoom = mix(1.3, 1.16, ep(frame, 0, 120, easeInOutCubic)) * mix(1, 1.07, ep(frame, 300, 430, easeInOutCubic));
  // scale(z) translate(p) resolves translate first, then scales around
  // center, so world-pixel pans need no zoom compensation.
  const panX = mix(0, -2180, panT);
  const worldFade = 1 - ep(frame, LINE_AT - 26, LINE_AT - 4, easeInOutCubic);
  const meterFade =
    ep(frame, METER_AT, METER_AT + 14, easeOutCubic) *
    (1 - ep(frame, LINE2_AT + 52, LINE2_AT + 68, easeInOutCubic));

  const ICON = { x: 690, y: 402, size: 200 };
  const iconPts = useImagePoints("beaver-icon.png", { x: ICON.x, y: ICON.y, w: ICON.size, h: ICON.size }, 5);

  return (
    <DarkScene>
      <ReflexAudio />

      <AbsoluteFill style={{ opacity: worldFade }}>
        <Camera zoom={zoom} x={panX}>
          {/* faint dot grid so the pan always has ground under it */}
          <div
            style={{
              position: "absolute",
              left: -400,
              top: -300,
              width: 4600,
              height: 1700,
              backgroundImage: `radial-gradient(circle, ${dark.whiteDim(9)} 1.5px, transparent 1.5px)`,
              backgroundSize: "56px 56px",
            }}
          />
          {/* stations */}
          <div style={{ position: "absolute", left: GEO[0].x, top: GEO[0].y }}>
            <Window title="invoice-2041.pdf" width={620}>
              <InvoiceDoc width={620} mode="dark" compact style={{ border: "none", borderRadius: 0, boxShadow: "none" }} />
            </Window>
          </div>
          <div style={{ position: "absolute", left: GEO[1].x, top: GEO[1].y }}>
            <Window title="refactor-stream.mp4" width={640}>
              <VideoCode width={640} />
            </Window>
          </div>
          <div style={{ position: "absolute", left: GEO[2].x, top: GEO[2].y }}>
            <Window title="q2-review.key" width={640}>
              <ChartSlide width={640} />
            </Window>
          </div>
          <div style={{ position: "absolute", left: GEO[3].x, top: GEO[3].y }}>
            <ErrorDialog />
          </div>

          {/* selections + pills fire on bar lines */}
          {STATION_DEFS.map((s, i) => {
            const g = GEO[i];
            const draw = ep(frame, s.at, s.at + 34, easeInOutCubic);
            const gone = progress(frame, s.at + 92, s.at + 108);
            if (frame < s.at || gone >= 1) return null;
            return (
              <React.Fragment key={i}>
                <SelectionBox
                  x={g.x - 14}
                  y={g.y - 14}
                  w={g.w + 28}
                  h={g.h + 28}
                  draw={draw}
                  dim={0.32 * (1 - gone)}
                  showReadout={frame < s.at + 44}
                  glow={pulse(frame, s.at + 34)}
                />
                <div
                  style={{
                    position: "absolute",
                    left: g.x + g.w / 2,
                    top: g.y + g.h + 40,
                    transform: "translateX(-50%)",
                    opacity: 1 - gone,
                  }}
                >
                  <HudPill
                    mode={frame < s.at + 58 ? "processing" : "copied"}
                    message={frame < s.at + 58 ? "Gnawing through…" : `Copied as ${s.label}`}
                    spinnerAngle={spin}
                    appear={ep(frame, s.at + 38, s.at + 50, easeOutCubic)}
                  />
                </div>
              </React.Fragment>
            );
          })}
        </Camera>

        {/* cold open: the chord, screen space */}
        {frame < 70 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 470,
              display: "flex",
              justifyContent: "center",
              gap: 18,
              opacity: 1 - chordGone,
            }}
          >
            <Keycap label="⌘" appear={ep(frame, 14, 26, easeOutCubic)} press={chordPress} />
            <Keycap label="⇧" appear={ep(frame, 22, 34, easeOutCubic)} press={chordPress} />
            <Keycap label="D" appear={ep(frame, 30, 42, easeOutCubic)} press={ep(frame, 44, 52, easeOutQuint)} />
          </div>
        )}

        {/* the rail: results accumulate at the bottom, in screen space */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 56,
            display: "flex",
            justifyContent: "center",
            gap: 26,
          }}
        >
          {STATION_DEFS.map((s, i) => (
            <RailCard
              key={i}
              file={s.file}
              label={s.label}
              body={s.out}
              appear={ep(frame, s.at + 62, s.at + 78, easeOutCubic)}
            />
          ))}
        </div>
      </AbsoluteFill>

      {/* the witness: zero network, docked top-right for the whole run */}
      <div style={{ position: "absolute", right: 72, top: 64, opacity: meterFade }}>
        <NetworkMeter
          appear={1}
          width={280}
          sweep={progress(frame, METER_AT + 16, LINE2_AT + 40)}
        />
      </div>

      {/* line one: breadth */}
      <WordRise
        text="It doesn't care where it came from."
        start={LINE_AT}
        out={LINE_AT + 52}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 486,
          textAlign: "center",
          fontFamily: font.sans,
          fontSize: 56,
          fontWeight: 550,
          letterSpacing: "-0.01em",
          color: dark.fg,
        }}
      />
      {/* line two: privacy, backed by the meter still on screen */}
      <WordRise
        text="Nothing leaves your Mac."
        start={LINE2_AT}
        out={FINALE - 20}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 486,
          textAlign: "center",
          fontFamily: font.sans,
          fontSize: 56,
          fontWeight: 550,
          letterSpacing: "-0.01em",
          color: dark.amber,
        }}
      />

      {/* finale */}
      {frame >= FINALE - 6 && iconPts && (
        <Particles
          width={1920}
          height={1080}
          frame={frame}
          mode="assemble"
          points={iconPts}
          t={ep(frame, FINALE, FINALE + 32, easeInOutCubic)}
          fade={1 - progress(frame, FINALE + 28, FINALE + 42)}
          seed={5}
          spread={430}
          maxCount={1100}
        />
      )}
      {frame >= FINALE + 24 && (
        <IconFinale start={FINALE + 24} iconAt={ICON} tagline="The missing ⌘C." subline="Free and open source · macOS" />
      )}
      <Glow x={960} y={500} r={520} opacity={pulse(frame, FINALE + 24, 30) * 0.7} />
    </DarkScene>
  );
};
