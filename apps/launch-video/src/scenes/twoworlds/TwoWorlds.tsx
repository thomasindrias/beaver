import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { dark, font, paper } from "../../theme";
import { ep, easeInOutCubic, easeOutCubic, easeOutQuint, mix, progress } from "../../lib/ease";
import { DarkScene, EnsureFonts } from "../../components/scene";
import { Camera, Crosshair, Glow, HudPill, Keycap, NetworkMeter, SelectionBox, pulse, useSpinner } from "../../components/ui";
import { DocCard, IconFinale, InvoiceDoc, CSV_LINES, JSON_LINES, MD_LINES } from "../../components/cards";
import { TypeOn } from "../../components/text";
import { Particles, useImagePoints } from "../../components/particles";

export const TWOWORLDS_DURATION = 780;

/** macOS-style arrow cursor. */
const Cursor: React.FC<{ x: number; y: number; opacity?: number }> = ({ x, y, opacity = 1 }) => (
  <svg
    width={30}
    height={30}
    viewBox="0 0 24 24"
    style={{ position: "absolute", left: x, top: y, opacity, filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.4))" }}
  >
    <path
      d="M5 3 L5 19 L9.2 15.2 L11.7 20.8 L14.4 19.6 L11.9 14 L17.5 14 Z"
      fill="#fff"
      stroke="#1a1a1a"
      strokeWidth={1.4}
    />
  </svg>
);

// Layout constants (1920x1080 world).
const DOC = { x: 560, y: 250, w: 800 };
const SEL = { x: DOC.x + 42, y: DOC.y + 128, w: DOC.w - 84, h: 380 };

export const TwoWorlds: React.FC = () => {
  const frame = useCurrentFrame();
  const spin = useSpinner();

  // ---- global timeline (bars of 80f, 90bpm) -------------------------------
  const DIM_AT = 210; // keypress lands, world drops dark
  const SELECT = { from: 250, to: 305 };
  const DISSOLVE = { from: 325, to: 390 };
  const PILL_IN = 330;
  const COPIED = 388;
  const CARD_IN = 402;
  const CHIPS = 480;
  const CSV_AT = 508;
  const JSON_AT = 540;
  const PROOF = 575;
  const FINALE = 645;

  const darkT = ep(frame, DIM_AT, DIM_AT + 14, easeInOutCubic);

  // One continuous camera: gentle push through paper world, slight recenter
  // on the drop, slow drift outward for the finale.
  const zoom =
    mix(1.02, 1.08, ep(frame, 0, DIM_AT, easeInOutCubic)) *
    mix(1, 0.97, ep(frame, DIM_AT, DIM_AT + 40, easeInOutCubic)) *
    mix(1, 1.05, ep(frame, DISSOLVE.from, CHIPS, easeInOutCubic)) *
    mix(1, 0.92, ep(frame, PROOF - 15, FINALE, easeInOutCubic));
  const camX = mix(0, -30, ep(frame, CARD_IN - 20, CARD_IN + 60, easeInOutCubic)) * (1 - ep(frame, PROOF - 15, FINALE, easeInOutCubic));

  // Cursor path in the paper world: drifts over the table, tries to select,
  // fails, wiggles.
  const cx = mix(DOC.x + 120, DOC.x + 560, ep(frame, 30, 95, easeInOutCubic));
  const wiggle = frame > 100 && frame < 128 ? Math.sin((frame - 100) * 0.9) * 7 * (1 - progress(frame, 100, 128)) : 0;
  const cursorX = cx + wiggle;
  const cursorY = mix(DOC.y + 240, DOC.y + 320, ep(frame, 30, 95, easeInOutCubic));

  // Icon target for the finale particle assembly.
  const ICON = { x: 630, y: 400, size: 210 };
  const iconPts = useImagePoints("beaver-icon.png", { x: ICON.x, y: ICON.y, w: ICON.size, h: ICON.size }, 5);

  const proofFade = ep(frame, FINALE - 28, FINALE - 4, easeInOutCubic);

  return (
    <AbsoluteFill style={{ background: paper.cream }}>
      <EnsureFonts />
      <Audio src={staticFile("audio/TwoWorlds.wav")} />
      {/* ---------- paper world ---------- */}
      <AbsoluteFill style={{ opacity: 1 - darkT }}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 80% 65% at 50% 40%, ${paper.paper} 0%, ${paper.cream} 75%)`,
          }}
        />
        <AbsoluteFill
          style={{
            backgroundImage: `radial-gradient(circle, rgba(43,32,25,0.10) 1.5px, transparent 1.5px)`,
            backgroundSize: "54px 54px",
            maskImage: "radial-gradient(ellipse 75% 65% at 50% 45%, transparent 30%, black 85%)",
            WebkitMaskImage: "radial-gradient(ellipse 75% 65% at 50% 45%, transparent 30%, black 85%)",
          }}
        />
        <Camera zoom={zoom} rotY={mix(-1.2, 0.6, ep(frame, 0, DIM_AT, easeInOutCubic))}>
          <div style={{ position: "absolute", left: DOC.x, top: DOC.y }}>
            <InvoiceDoc width={DOC.w} mode="paper" />
          </div>
          {frame < DIM_AT && <Cursor x={cursorX} y={cursorY} />}
        </Camera>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 108,
            textAlign: "center",
            fontFamily: font.display,
            fontSize: 52,
            fontWeight: 550,
            color: paper.ink,
          }}
        >
          <TypeOn text="You can see the data." start={26} cps={26} cursorColor={paper.orange} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 176,
            textAlign: "center",
            fontFamily: font.display,
            fontSize: 52,
            fontWeight: 550,
            color: paper.orange,
          }}
        >
          <TypeOn text="You just can't use it." start={118} cps={26} cursorColor={paper.orange} />
        </div>
        {/* keycaps */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 850,
            display: "flex",
            justifyContent: "center",
            gap: 18,
          }}
        >
          <Keycap label="⌘" appear={ep(frame, 162, 174, easeOutCubic)} press={ep(frame, 200, 208, easeOutQuint)} />
          <Keycap label="⇧" appear={ep(frame, 172, 184, easeOutCubic)} press={ep(frame, 200, 208, easeOutQuint)} />
          <Keycap label="D" appear={ep(frame, 182, 194, easeOutCubic)} press={ep(frame, 202, 210, easeOutQuint)} />
        </div>
      </AbsoluteFill>

      {/* ---------- dark world ---------- */}
      <AbsoluteFill style={{ opacity: darkT }}>
        <DarkScene>
          <Camera zoom={zoom} x={camX}>
            {/* the same doc, now a dimmed screenshot being captured */}
            <div
              style={{
                position: "absolute",
                left: DOC.x,
                top: DOC.y,
                opacity: (1 - ep(frame, DISSOLVE.from, DISSOLVE.to, easeInOutCubic)) * (1 - proofFade),
                filter: `brightness(${mix(0.75, 0.95, ep(frame, SELECT.from, SELECT.to, easeInOutCubic))})`,
              }}
            >
              <InvoiceDoc width={DOC.w} mode="dark" />
            </div>

            {/* crosshair, then the selection */}
            {frame < SELECT.from + 6 && darkT > 0.5 && (
              <Crosshair cx={SEL.x} cy={SEL.y} opacity={ep(frame, DIM_AT + 14, DIM_AT + 26, easeOutCubic) * (1 - ep(frame, SELECT.from, SELECT.from + 6, easeOutCubic))} />
            )}
            {frame >= SELECT.from && frame < DISSOLVE.to && (
              <SelectionBox
                x={SEL.x}
                y={SEL.y}
                w={SEL.w}
                h={SEL.h}
                draw={ep(frame, SELECT.from, SELECT.to, easeInOutCubic)}
                dim={0.45 * (1 - ep(frame, DISSOLVE.from + 20, DISSOLVE.to, easeInOutCubic))}
                showReadout={frame < DISSOLVE.from}
                glow={pulse(frame, SELECT.to)}
              />
            )}

            {/* dissolve to particles */}
            {frame >= DISSOLVE.from && frame <= DISSOLVE.to + 30 && (
              <Particles
                width={1920}
                height={1080}
                frame={frame}
                mode="dissolve"
                rect={{ x: SEL.x, y: SEL.y, w: SEL.w, h: SEL.h }}
                t={ep(frame, DISSOLVE.from, DISSOLVE.to, easeInOutCubic)}
                fade={1 - progress(frame, DISSOLVE.to, DISSOLVE.to + 28)}
                seed={11}
              />
            )}

            {/* HUD pill under the selection */}
            {frame >= PILL_IN && frame < PROOF && (
              <div
                style={{
                  position: "absolute",
                  left: SEL.x + SEL.w / 2,
                  top: SEL.y + SEL.h + 46,
                  transform: "translateX(-50%)",
                  opacity: 1 - ep(frame, PROOF - 22, PROOF - 6, easeInOutCubic),
                }}
              >
                <HudPill
                  mode={frame < COPIED ? "processing" : frame < CHIPS ? "copied" : "chips"}
                  message={frame < COPIED ? "Chucking wood…" : "Copied as table"}
                  spinnerAngle={spin}
                  chipActive={frame < CSV_AT ? 0 : frame < JSON_AT ? 1 : 2}
                  appear={ep(frame, PILL_IN, PILL_IN + 12, easeOutCubic)}
                />
              </div>
            )}

            {/* the typed output card */}
            {frame >= CARD_IN && (
              <div
                style={{
                  position: "absolute",
                  left: 490,
                  top: 326,
                  opacity: (1 - ep(frame, PROOF - 22, PROOF - 6, easeInOutCubic)),
                  transform: `scale(${mix(1, 0.9, ep(frame, PROOF - 22, PROOF, easeInOutCubic))})`,
                }}
              >
                <DocCard
                  key={frame < CSV_AT ? "md" : frame < JSON_AT ? "csv" : "json"}
                  title={frame < CSV_AT ? "capture.md" : frame < JSON_AT ? "capture.csv" : "capture.json"}
                  lines={frame < CSV_AT ? MD_LINES : frame < JSON_AT ? CSV_LINES : JSON_LINES}
                  start={frame < CSV_AT ? CARD_IN + 4 : frame < JSON_AT ? CSV_AT + 2 : JSON_AT + 2}
                  cps={frame < CSV_AT ? 95 : 260}
                  width={940}
                  appear={ep(frame, CARD_IN, CARD_IN + 14, easeOutCubic)}
                />
              </div>
            )}
          </Camera>

          {/* proof beat */}
          {frame >= PROOF - 10 && (
            <>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 470,
                  textAlign: "center",
                  fontFamily: font.sans,
                  fontSize: 58,
                  fontWeight: 550,
                  letterSpacing: "-0.01em",
                  color: dark.fg,
                  opacity: 1 - ep(frame, FINALE - 24, FINALE - 6, easeInOutCubic),
                }}
              >
                <TypeOn text="Nothing leaves your Mac." start={PROOF} cps={24} cursorColor={dark.amber} />
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 580,
                  display: "flex",
                  justifyContent: "center",
                  opacity: 1 - ep(frame, FINALE - 24, FINALE - 6, easeInOutCubic),
                }}
              >
                <NetworkMeter width={380} appear={ep(frame, PROOF + 8, PROOF + 20, easeOutCubic)} sweep={ep(frame, PROOF + 14, FINALE - 26, easeInOutCubic)} />
              </div>
            </>
          )}

          {/* finale: particles assemble the icon, wordmark reveals */}
          {frame >= FINALE - 6 && iconPts && (
            <Particles
              width={1920}
              height={1080}
              frame={frame}
              mode="assemble"
              points={iconPts}
              t={ep(frame, FINALE, FINALE + 34, easeInOutCubic)}
              fade={1 - progress(frame, FINALE + 30, FINALE + 44)}
              seed={7}
              spread={420}
              maxCount={1100}
            />
          )}
          {frame >= FINALE + 26 && (
            <IconFinale
              start={FINALE + 26}
              iconAt={ICON}
              tagline="Stop retyping your screen."
              subline="Free and open source · macOS"
            />
          )}
          <Glow x={960} y={505} r={520} opacity={pulse(frame, FINALE + 26, 30) * 0.7} />
        </DarkScene>
      </AbsoluteFill>

      {/* the drop: one bright breath at the transition */}
      <AbsoluteFill
        style={{
          background: dark.amberDim(60),
          opacity: pulse(frame, DIM_AT, 24) * 0.55,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
