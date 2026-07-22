import React from "react";
import { Audio, staticFile, useCurrentFrame } from "remotion";
import { dark, font } from "../../theme";
import { ep, easeInOutCubic, easeOutCubic, mix, progress } from "../../lib/ease";
import { DarkScene } from "../../components/scene";
import { Camera, Glow, HudPill, pulse, useSpinner } from "../../components/ui";
import { IconFinale, InvoiceDoc, INVOICE_TOTAL } from "../../components/cards";
import { Rise, TypeOn } from "../../components/text";
import { Particles, useImagePoints } from "../../components/particles";

export const RECEIPT_DURATION = 660;

/** Counts up with tabular numerals; the sound of a meter running. */
const TokenMeter: React.FC<{
  value: number;
  label: string;
  warm?: boolean;
  appear: number;
}> = ({ value, label, warm = false, appear }) => (
  <div
    style={{
      width: 340,
      borderRadius: 14,
      border: `1.5px solid ${dark.border}`,
      background: dark.popover,
      padding: "18px 24px",
      fontFamily: font.mono,
      opacity: appear,
      transform: `translateY(${(1 - easeOutCubic(appear)) * 20}px)`,
    }}
  >
    <div style={{ fontSize: 16, color: dark.mutedFg, marginBottom: 8 }}>{label}</div>
    <div
      style={{
        fontSize: 54,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        color: warm ? dark.amber : dark.fg,
        letterSpacing: "-0.01em",
      }}
    >
      {Math.round(value).toLocaleString("en-US")}
    </div>
  </div>
);

export const Receipt: React.FC = () => {
  const frame = useCurrentFrame();
  const spin = useSpinner();

  const SPLIT = 108;
  const UPLOAD = { from: 140, to: 205 };
  const SHRINK = { from: 205, to: 250 };
  const CLOUD_OUT = 300;
  const BEAVER_PILL = 190;
  const BEAVER_OUT = 262;
  const CONVERGE = 452;
  const FINALE = 528;

  const splitT = ep(frame, SPLIT, SPLIT + 30, easeInOutCubic);
  const worldFade = 1 - ep(frame, CONVERGE - 26, CONVERGE, easeInOutCubic);

  // Cloud lane: meter grinds up slowly; Beaver lane: lands almost at once.
  const cloudTokens = mix(0, 1928, ep(frame, UPLOAD.from + 20, CLOUD_OUT + 90, easeInOutCubic));
  const beaverTokens = mix(0, 184, ep(frame, BEAVER_PILL + 26, BEAVER_PILL + 58, easeOutCubic));

  // The guessed digit: after the downscale, the cloud's total flickers
  // between wrong readings before settling on a wrong one.
  const guessed = frame > CLOUD_OUT + 8 ? (Math.floor(frame / 7) % 3 === 0 ? "$651.75" : "$681.75") : "$681.75";

  const shrink = ep(frame, SHRINK.from, SHRINK.to, easeInOutCubic);
  const ICON = { x: 690, y: 396, size: 200 };
  const iconPts = useImagePoints("beaver-icon.png", { x: ICON.x, y: ICON.y, w: ICON.size, h: ICON.size }, 5);

  const laneStyle = (side: "l" | "r"): React.CSSProperties => ({
    position: "absolute",
    top: 236,
    width: 760,
    left: side === "l" ? 100 : 1060,
    opacity: splitT * worldFade,
  });

  return (
    <DarkScene>
      <Audio src={staticFile("audio/Receipt.wav")} />
      {/* the question */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: mix(470, 92, splitT),
          textAlign: "center",
          fontFamily: font.sans,
          fontSize: mix(60, 40, splitT),
          fontWeight: 550,
          letterSpacing: "-0.01em",
          color: dark.fg,
          opacity: worldFade,
        }}
      >
        <TypeOn text="Can't I just paste it into ChatGPT?" start={22} cps={26} cursorColor={dark.amber} />
      </div>

      {/* center divider */}
      <div
        style={{
          position: "absolute",
          left: 959,
          top: mix(540, 200, splitT),
          bottom: mix(540, 120, splitT),
          width: 2,
          background: dark.whiteDim(8),
          opacity: splitT * worldFade,
        }}
      />

      <Camera zoom={mix(1.0, 1.045, ep(frame, SPLIT, CONVERGE, easeInOutCubic))}>
        {/* ---- cloud lane ---- */}
        <div style={laneStyle("l")}>
          <div style={{ fontFamily: font.mono, fontSize: 19, color: dark.mutedFg, marginBottom: 26, textAlign: "center" }}>
            screenshot → cloud
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                transform: `scale(${mix(0.58, 0.36, shrink)}) `,
                transformOrigin: "top center",
                filter: `blur(${shrink * 3.2}px) saturate(${1 - shrink * 0.3})`,
                opacity: 1 - ep(frame, CLOUD_OUT - 10, CLOUD_OUT + 6, easeInOutCubic) * 0.75,
              }}
            >
              <InvoiceDoc width={760} mode="dark" />
            </div>
          </div>
          {/* upload arrow */}
          {frame >= UPLOAD.from && frame < SHRINK.to && (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 66 - ep(frame, UPLOAD.from, UPLOAD.to, easeInOutCubic) * 34,
                transform: "translateX(-50%)",
                fontFamily: font.mono,
                fontSize: 26,
                color: dark.mutedFg,
                opacity: Math.sin(progress(frame, UPLOAD.from, UPLOAD.to) * Math.PI),
              }}
            >
              ↑ uploading
            </div>
          )}
          {/* downscale label */}
          <Rise
            start={SHRINK.from + 8}
            out={CLOUD_OUT + 76}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 356,
              textAlign: "center",
              fontFamily: font.mono,
              fontSize: 20,
              color: dark.mutedFg,
            }}
          >
            downscaled before the model reads it
          </Rise>
          {/* the wrong total */}
          {frame >= CLOUD_OUT && (
            <div style={{ position: "absolute", left: 0, right: 0, top: 404, textAlign: "center" }}>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 44,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: dark.fg,
                  opacity: ep(frame, CLOUD_OUT, CLOUD_OUT + 10, easeOutCubic),
                }}
              >
                Total: {guessed}
              </span>
              <Rise
                start={CLOUD_OUT + 14}
                style={{ fontFamily: font.mono, fontSize: 19, color: "oklch(0.62 0.21 25)", marginTop: 10 }}
              >
                guessed · was {INVOICE_TOTAL}
              </Rise>
            </div>
          )}
          <div style={{ position: "absolute", left: "50%", top: 520, transform: "translateX(-50%)" }}>
            <TokenMeter
              value={cloudTokens}
              label="tokens"
              appear={ep(frame, UPLOAD.from + 10, UPLOAD.from + 24, easeOutCubic)}
            />
          </div>
        </div>

        {/* ---- beaver lane ---- */}
        <div style={laneStyle("r")}>
          <div style={{ fontFamily: font.mono, fontSize: 19, color: dark.amber, marginBottom: 26, textAlign: "center" }}>
            Beaver · on device
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ transform: "scale(0.58)", transformOrigin: "top center" }}>
              <InvoiceDoc width={760} mode="dark" />
            </div>
          </div>
          {frame >= BEAVER_PILL && (
            <div style={{ position: "absolute", left: "50%", top: 330, transform: "translateX(-50%)" }}>
              <HudPill
                mode={frame < BEAVER_OUT ? "processing" : "copied"}
                message={frame < BEAVER_OUT ? "Chewing the data…" : "Copied as table"}
                spinnerAngle={spin}
                appear={ep(frame, BEAVER_PILL, BEAVER_PILL + 12, easeOutCubic)}
              />
            </div>
          )}
          {frame >= BEAVER_OUT + 14 && (
            <div style={{ position: "absolute", left: 0, right: 0, top: 404, textAlign: "center" }}>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 44,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: dark.fg,
                  opacity: ep(frame, BEAVER_OUT + 14, BEAVER_OUT + 24, easeOutCubic),
                }}
              >
                Total: <span style={{ color: dark.amber }}>{INVOICE_TOTAL}</span>
              </span>
              <Rise
                start={BEAVER_OUT + 26}
                style={{ fontFamily: font.mono, fontSize: 19, color: dark.amber, marginTop: 10 }}
              >
                exact · read at full resolution
              </Rise>
            </div>
          )}
          <div style={{ position: "absolute", left: "50%", top: 520, transform: "translateX(-50%)" }}>
            <TokenMeter
              value={beaverTokens}
              label="tokens"
              warm
              appear={ep(frame, BEAVER_PILL + 16, BEAVER_PILL + 30, easeOutCubic)}
            />
          </div>
        </div>
      </Camera>

      {/* converge */}
      <Rise
        start={CONVERGE + 6}
        out={FINALE - 16}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 486,
          textAlign: "center",
          fontFamily: font.sans,
          fontSize: 60,
          fontWeight: 550,
          letterSpacing: "-0.01em",
          color: dark.fg,
        }}
      >
        It never left your Mac.
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
          seed={9}
          spread={430}
          maxCount={1100}
        />
      )}
      {frame >= FINALE + 24 && (
        <IconFinale
          start={FINALE + 24}
          iconAt={ICON}
          tagline="184 tokens. Exact text."
          subline="Free and open source · macOS"
        />
      )}
      <Glow x={960} y={496} r={520} opacity={pulse(frame, FINALE + 24, 30) * 0.7} />
    </DarkScene>
  );
};
