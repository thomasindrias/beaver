import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { dark, font, paper } from "../../theme";
import { ep, easeInOutCubic, easeOutCubic, mix, progress } from "../../lib/ease";
import { DarkScene } from "../../components/scene";
import { Camera, Glow, HudPill, SelectionBox, pulse, useSpinner } from "../../components/ui";
import { IconFinale, InvoiceDoc } from "../../components/cards";
import { Rise } from "../../components/text";
import { Particles, useImagePoints } from "../../components/particles";

export const REFLEX_DURATION = 620;

/** A paused video player holding code. */
const VideoCode: React.FC<{ width?: number }> = ({ width = 640 }) => (
  <div
    style={{
      width,
      borderRadius: 14,
      overflow: "hidden",
      border: `1.5px solid ${dark.border}`,
      background: "#0d0d10",
      boxShadow: "0 30px 70px rgba(0,0,0,0.5)",
      fontFamily: font.mono,
    }}
  >
    <div style={{ padding: "26px 30px", fontSize: 19, lineHeight: 1.7, color: "#c9c9d1" }}>
      <div><span style={{ color: dark.amber }}>def</span> retention_cutoff(days):</div>
      <div>&nbsp;&nbsp;<span style={{ color: dark.amber }}>if</span> days <span style={{ color: dark.amber }}>is</span> None:</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: dark.amber }}>return</span> None</div>
      <div>&nbsp;&nbsp;now = datetime.now(timezone.utc)</div>
      <div>&nbsp;&nbsp;<span style={{ color: dark.amber }}>return</span> now - timedelta(days=days)</div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", background: "rgba(0,0,0,0.55)" }}>
      <span style={{ width: 0, height: 0, borderLeft: "14px solid #fff", borderTop: "9px solid transparent", borderBottom: "9px solid transparent" }} />
      <div style={{ flex: 1, height: 5, borderRadius: 99, background: "rgba(255,255,255,0.18)" }}>
        <div style={{ width: "38%", height: "100%", borderRadius: 99, background: dark.amber }} />
      </div>
      <span style={{ fontFamily: font.mono, fontSize: 14, color: "#9a9aa3" }}>12:41 / 33:05</span>
    </div>
  </div>
);

/** A light slide with a bar chart. */
const ChartSlide: React.FC<{ width?: number }> = ({ width = 640 }) => {
  const bars = [42, 78, 56, 96, 70];
  return (
    <div
      style={{
        width,
        borderRadius: 14,
        background: "#f6f4ef",
        border: "1.5px solid rgba(0,0,0,0.08)",
        boxShadow: "0 30px 70px rgba(0,0,0,0.45)",
        padding: "30px 36px 26px",
        fontFamily: font.sans,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 600, color: "#2c2a26", marginBottom: 20 }}>
        Q2 captures per week
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 22, height: 190 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
            <div
              style={{
                width: "100%",
                height: `${b * 0.82}%`,
                borderRadius: "6px 6px 0 0",
                background: i === 3 ? paper.orange : "#d4cec2",
              }}
            />
            <span style={{ fontSize: 14, color: "#8a857b" }}>W{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** A macOS-flavored error dialog. */
const ErrorDialog: React.FC<{ width?: number }> = ({ width = 520 }) => (
  <div
    style={{
      width,
      borderRadius: 16,
      background: "rgba(38,38,42,0.98)",
      border: `1.5px solid ${dark.whiteDim(12)}`,
      boxShadow: "0 30px 70px rgba(0,0,0,0.55)",
      padding: "30px 34px",
      fontFamily: font.sans,
      color: dark.fg,
    }}
  >
    <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
      <span
        style={{
          width: 0,
          height: 0,
          borderLeft: "19px solid transparent",
          borderRight: "19px solid transparent",
          borderBottom: `33px solid ${dark.amber}`,
        }}
      />
      <span style={{ fontSize: 24, fontWeight: 600 }}>Export failed</span>
    </div>
    <div style={{ fontFamily: font.mono, fontSize: 17, lineHeight: 1.6, color: dark.mutedFg }}>
      code 3: missing column "Amount"
      <br />
      at export/csv.rs:214
    </div>
  </div>
);

/** Small mono result card that snaps into the rail. */
const RailCard: React.FC<{ label: string; body: string; appear: number }> = ({ label, body, appear }) => (
  <div
    style={{
      width: 380,
      borderRadius: 12,
      background: dark.card,
      border: `1.5px solid ${dark.border}`,
      padding: "14px 18px",
      opacity: appear,
      transform: `translateY(${(1 - easeOutCubic(appear)) * 26}px) scale(${mix(0.94, 1, easeOutCubic(appear))})`,
      boxShadow: `0 18px 44px rgba(0,0,0,0.45), 0 0 24px ${dark.amberDim(6)}`,
    }}
  >
    <div style={{ fontFamily: font.sans, fontSize: 14, color: dark.amber, marginBottom: 6 }}>{label}</div>
    <div style={{ fontFamily: font.mono, fontSize: 14.5, lineHeight: 1.55, color: dark.fg, whiteSpace: "pre" }}>{body}</div>
  </div>
);

// The four stations along the panning canvas.
const STATIONS = [
  { x: 240, y: 240, w: 620, h: 420, at: 70, out: "| Date | Description | Amount |\n| 2026-06-03 | Oak planks | $384.00 |", label: "table" },
  { x: 1130, y: 200, w: 640, h: 380, at: 170, out: "def retention_cutoff(days):\n  if days is None: return None", label: "code" },
  { x: 2000, y: 260, w: 640, h: 360, at: 270, out: "Week,Captures\nW4,96", label: "table" },
  { x: 2880, y: 300, w: 520, h: 260, at: 370, out: '{ "error": "missing column",\n  "at": "export/csv.rs:214" }', label: "text" },
] as const;

export const Reflex: React.FC = () => {
  const frame = useCurrentFrame();
  const spin = useSpinner();
  const LINE_AT = 440;
  const FINALE = 500;

  // One continuous pan across the canvas; eases between stations on bar lines.
  const panT = ep(frame, 40, 420, easeInOutCubic);
  const panX = mix(0, -2180, panT);
  const zoom = mix(1.06, 1.0, ep(frame, 0, 120, easeInOutCubic)) * mix(1, 1.04, ep(frame, 300, 430, easeInOutCubic));
  const worldFade = 1 - ep(frame, LINE_AT - 26, LINE_AT - 4, easeInOutCubic);

  const ICON = { x: 690, y: 402, size: 200 };
  const iconPts = useImagePoints("beaver-icon.png", { x: ICON.x, y: ICON.y, w: ICON.size, h: ICON.size }, 5);

  return (
    <DarkScene>
      <Audio src={staticFile("audio/Reflex.wav")} />
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
              backgroundImage: `radial-gradient(circle, ${dark.whiteDim(7)} 1.5px, transparent 1.5px)`,
              backgroundSize: "56px 56px",
            }}
          />
          {/* stations */}
          <div style={{ position: "absolute", left: STATIONS[0].x, top: STATIONS[0].y }}>
            <InvoiceDoc width={620} mode="dark" />
          </div>
          <div style={{ position: "absolute", left: STATIONS[1].x, top: STATIONS[1].y }}>
            <VideoCode />
          </div>
          <div style={{ position: "absolute", left: STATIONS[2].x, top: STATIONS[2].y }}>
            <ChartSlide />
          </div>
          <div style={{ position: "absolute", left: STATIONS[3].x, top: STATIONS[3].y }}>
            <ErrorDialog />
          </div>

          {/* selections + pills fire on bar lines */}
          {STATIONS.map((s, i) => {
            const draw = ep(frame, s.at, s.at + 34, easeInOutCubic);
            const gone = progress(frame, s.at + 92, s.at + 108);
            if (frame < s.at || gone >= 1) return null;
            return (
              <React.Fragment key={i}>
                <SelectionBox
                  x={s.x - 14}
                  y={s.y - 14}
                  w={s.w + 28}
                  h={s.h + 28}
                  draw={draw}
                  dim={0.32 * (1 - gone)}
                  showReadout={frame < s.at + 44}
                  glow={pulse(frame, s.at + 34)}
                />
                <div
                  style={{
                    position: "absolute",
                    left: s.x + s.w / 2,
                    top: s.y + s.h + 40,
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

        {/* the rail: results accumulate at the bottom, in screen space */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 64,
            display: "flex",
            justifyContent: "center",
            gap: 26,
          }}
        >
          {STATIONS.map((s, i) => (
            <RailCard
              key={i}
              label={`✓ ${s.label}`}
              body={s.out}
              appear={ep(frame, s.at + 62, s.at + 76, easeOutCubic)}
            />
          ))}
        </div>
      </AbsoluteFill>

      {/* the one line */}
      <Rise
        start={LINE_AT}
        out={FINALE - 18}
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
      >
        It doesn't care where it came from.
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
