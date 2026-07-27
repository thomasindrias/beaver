import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { dark, font } from "../../theme";
import { ep, easeInOutCubic, easeOutCubic, mix, progress } from "../../lib/ease";
import { DarkScene } from "../../components/scene";
import { Camera, Glow, HudPill, NetworkMeter, SelectionBox, pulse, useSpinner } from "../../components/ui";
import { DocCard, IconFinale, InvoiceDoc, MD_LINES } from "../../components/cards";
import { Rise } from "../../components/text";
import { Particles, useImagePoints } from "../../components/particles";

export const LIGHTSOUT_DURATION = 620;

/** Control-center style Wi-Fi card whose toggle slides off. */
const WifiToggle: React.FC<{ appear: number; off: number }> = ({ appear, off }) => (
  <div
    style={{
      width: 430,
      borderRadius: 20,
      background: "rgba(44,44,48,0.96)",
      border: `1.5px solid ${dark.whiteDim(12)}`,
      boxShadow: "0 30px 70px rgba(0,0,0,0.55)",
      padding: "26px 30px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontFamily: font.sans,
      opacity: appear,
      transform: `scale(${mix(0.94, 1, easeOutCubic(appear))})`,
    }}
  >
    <div>
      <div style={{ fontSize: 26, fontWeight: 600, color: dark.fg }}>Wi-Fi</div>
      <div style={{ fontSize: 18, color: dark.mutedFg, marginTop: 4 }}>
        {off > 0.5 ? "Off" : "Lodge 5G"}
      </div>
    </div>
    <div
      style={{
        width: 84,
        height: 48,
        borderRadius: 99,
        background: off > 0.5 ? "rgba(120,120,128,0.32)" : "#34c759",
        position: "relative",
        transition: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: mix(39, 3, off),
          width: 42,
          height: 42,
          borderRadius: 99,
          background: "#fff",
          boxShadow: "0 3px 8px rgba(0,0,0,0.35)",
        }}
      />
    </div>
  </div>
);

export const LightsOut: React.FC = () => {
  const frame = useCurrentFrame();
  const spin = useSpinner();

  const OFF = 58; // the toggle lands
  const DOC_IN = 96;
  const SELECT = { from: 140, to: 190 };
  const PILL = 202;
  const COPIED = 258;
  const CARD = 276;
  const LINES = 392;
  const SLEEP = 452;
  const FINALE = 512;

  const off = ep(frame, OFF, OFF + 10, easeInOutCubic);
  const togGone = ep(frame, OFF + 26, OFF + 40, easeInOutCubic);
  const demoFade = 1 - ep(frame, LINES - 20, LINES, easeInOutCubic);
  const lineFade = 1 - ep(frame, SLEEP - 14, SLEEP, easeInOutCubic);

  const DOC = { x: 590, y: 210, w: 700 };
  const SEL = { x: DOC.x + 36, y: DOC.y + 112, w: DOC.w - 72, h: 336 };
  const ICON = { x: 690, y: 398, size: 200 };
  const iconPts = useImagePoints("beaver-icon.png", { x: ICON.x, y: ICON.y, w: ICON.size, h: ICON.size }, 5);

  return (
    <DarkScene lift={mix(1.6, 0.7, off)}>
      <Audio src={staticFile("audio/LightsOut.wav")} />
      {/* the world grows darker when the toggle flips */}
      <AbsoluteFill style={{ background: `rgba(0,0,0,${off * 0.28})` }} />

      {/* wifi card */}
      {frame < OFF + 44 && (
        <div style={{ position: "absolute", left: 745, top: 420, opacity: 1 - togGone }}>
          <WifiToggle appear={ep(frame, 12, 26, easeOutCubic)} off={off} />
        </div>
      )}

      {/* the witness: docks bottom-left after the toggle, stays to the end */}
      {frame >= OFF + 34 && (
        <div style={{ position: "absolute", left: 72, bottom: 64, opacity: 1 - ep(frame, FINALE - 20, FINALE, easeInOutCubic) }}>
          <NetworkMeter
            appear={ep(frame, OFF + 34, OFF + 48, easeOutCubic)}
            sweep={progress(frame, OFF + 48, FINALE - 30)}
            width={280}
          />
        </div>
      )}

      <Camera zoom={mix(1.0, 1.06, ep(frame, DOC_IN, LINES, easeInOutCubic))}>
        <AbsoluteFill style={{ opacity: demoFade }}>
          {frame >= DOC_IN && (
            <div
              style={{
                position: "absolute",
                left: DOC.x,
                top: DOC.y,
                opacity: ep(frame, DOC_IN, DOC_IN + 16, easeOutCubic) * (1 - ep(frame, CARD - 6, CARD + 10, easeInOutCubic) * 0.85),
                filter: "brightness(0.85)",
              }}
            >
              <InvoiceDoc width={DOC.w} mode="dark" />
            </div>
          )}
          {frame >= SELECT.from && (
            <SelectionBox
              x={SEL.x}
              y={SEL.y}
              w={SEL.w}
              h={SEL.h}
              draw={ep(frame, SELECT.from, SELECT.to, easeInOutCubic)}
              dim={0.4 * (1 - ep(frame, CARD - 6, CARD + 10, easeInOutCubic))}
              showReadout={frame < PILL}
              glow={pulse(frame, SELECT.to)}
            />
          )}
          {frame >= PILL && (
            <div
              style={{
                position: "absolute",
                left: SEL.x + SEL.w / 2,
                top: SEL.y + SEL.h + 44,
                transform: "translateX(-50%)",
              }}
            >
              <HudPill
                mode={frame < COPIED ? "processing" : "copied"}
                message={frame < COPIED ? "Dam near done…" : "Copied as table"}
                spinnerAngle={spin}
                appear={ep(frame, PILL, PILL + 12, easeOutCubic)}
              />
            </div>
          )}
          {frame >= CARD + 8 && (
            <div style={{ position: "absolute", left: 505, top: 268 }}>
              <DocCard
                title="capture.md"
                lines={MD_LINES}
                start={CARD + 14}
                cps={110}
                width={910}
                appear={ep(frame, CARD + 8, CARD + 22, easeOutCubic)}
              />
            </div>
          )}
        </AbsoluteFill>
      </Camera>

      {/* claim lines */}
      <div style={{ opacity: lineFade }}>
        <Rise
          start={LINES}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 452,
            textAlign: "center",
            fontFamily: font.sans,
            fontSize: 56,
            fontWeight: 550,
            color: dark.fg,
          }}
        >
          Works offline.
        </Rise>
        <Rise
          start={LINES + 22}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 532,
            textAlign: "center",
            fontFamily: font.sans,
            fontSize: 56,
            fontWeight: 550,
            color: dark.mutedFg,
          }}
        >
          Works on a plane.
        </Rise>
      </div>
      <Rise
        start={SLEEP}
        out={FINALE - 16}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 488,
          textAlign: "center",
          fontFamily: font.sans,
          fontSize: 62,
          fontWeight: 550,
          letterSpacing: "-0.01em",
          color: dark.amber,
        }}
      >
        Your data sleeps at home.
      </Rise>

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
          seed={13}
          spread={430}
          maxCount={1100}
        />
      )}
      {frame >= FINALE + 24 && (
        <IconFinale start={FINALE + 24} iconAt={ICON} subline="Free and open source · macOS" />
      )}
      <Glow x={960} y={498} r={520} opacity={pulse(frame, FINALE + 24, 30) * 0.7} />
    </DarkScene>
  );
};
