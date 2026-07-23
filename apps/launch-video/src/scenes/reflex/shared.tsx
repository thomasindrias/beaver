import React from "react";
import { Audio, staticFile } from "remotion";
import { dark, font, paper } from "../../theme";
import { easeOutBack, mix } from "../../lib/ease";
import { Sfx } from "../../components/sfx";

/** One timeline for both Reflex compositions. Frames at 30fps; stations
 * fire on bar lines of the 90 BPM grid. */
export const REFLEX_DURATION = 700;
export const STATION_AT = [70, 170, 270, 370] as const;
export const LINE_AT = 440;
export const LINE2_AT = 500;
export const METER_AT = 150;
export const FINALE = 576;

export interface StationDef {
  at: number;
  file: string;
  label: string;
  out: string;
}

export const STATION_DEFS: StationDef[] = [
  {
    at: STATION_AT[0],
    file: "capture.md",
    label: "table",
    out: "| Date       | Amount  |\n| 2026-06-03 | $384.00 |\n| 2026-06-07 | $156.00 |",
  },
  {
    at: STATION_AT[1],
    file: "capture.md",
    label: "code",
    out: "def retention_cutoff(days):\n  if days is None:\n    return None",
  },
  {
    at: STATION_AT[2],
    file: "capture.csv",
    label: "table",
    out: "Week,Captures\nW6,88\nW8,102",
  },
  {
    at: STATION_AT[3],
    file: "capture.json",
    label: "text",
    out: '{ "error": "missing column",\n  "code": 3,\n  "at": "export/csv.rs:214" }',
  },
];

/** Bed + every placed effect, shared verbatim by both aspect ratios. */
export const ReflexAudio: React.FC = () => (
  <>
    <Audio src={staticFile("audio/Reflex.wav")} />
    <Sfx name="key" at={16} volume={0.55} />
    <Sfx name="key" at={24} volume={0.55} />
    <Sfx name="key" at={32} volume={0.6} />
    <Sfx name="key" at={42} volume={0.9} />
    <Sfx name="whoosh" at={44} volume={0.55} />
    {STATION_DEFS.map((s, i) => (
      <React.Fragment key={i}>
        <Sfx name="click" at={s.at} volume={0.7} />
        <Sfx name="shutter" at={s.at + 34} volume={0.8} />
        <Sfx name="pop" at={s.at + 40} volume={0.55} />
        <Sfx name="pop" at={s.at + 64} volume={0.7} />
      </React.Fragment>
    ))}
    <Sfx name="pop" at={METER_AT + 2} volume={0.4} />
    <Sfx name="whoosh" at={140} volume={0.32} />
    <Sfx name="whoosh" at={240} volume={0.32} />
    <Sfx name="whoosh" at={340} volume={0.32} />
    <Sfx name="whoosh" at={LINE_AT - 6} volume={0.45} />
    <Sfx name="whoosh" at={LINE2_AT - 6} volume={0.4} />
  </>
);

/** Code inside a paused video player; bare, for wrapping in Window. */
export const VideoCode: React.FC<{ width?: number }> = ({ width = 640 }) => {
  const kw = (t: string) => <span style={{ color: dark.amber }}>{t}</span>;
  return (
    <div style={{ width, background: "#0d0d10", fontFamily: font.mono }}>
      <div style={{ padding: "22px 30px", fontSize: 18, lineHeight: 1.65, color: "#c9c9d1" }}>
        <div>{kw("def")} retention_cutoff(days):</div>
        <div>&nbsp;&nbsp;<span style={{ color: "#8b8b96" }}>"""Oldest capture we keep."""</span></div>
        <div>&nbsp;&nbsp;{kw("if")} days {kw("is")} None:</div>
        <div>&nbsp;&nbsp;&nbsp;&nbsp;{kw("return")} None</div>
        <div>&nbsp;&nbsp;now = datetime.now(timezone.utc)</div>
        <div>&nbsp;&nbsp;{kw("return")} now - timedelta(days=days)</div>
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
};

/** A light slide with a labeled bar chart; bare, for wrapping in Window. */
export const ChartSlide: React.FC<{ width?: number }> = ({ width = 640 }) => {
  const bars = [12, 28, 41, 96, 63, 88, 74, 102];
  const max = Math.max(...bars);
  return (
    <div style={{ width, background: "#f6f4ef", padding: "26px 34px 22px", fontFamily: font.sans }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div style={{ fontSize: 23, fontWeight: 600, color: "#2c2a26" }}>Q2 captures per week</div>
        <div style={{ fontSize: 13.5, color: "#8a857b" }}>June review · internal</div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 190, borderBottom: "2px solid #e3dccd", paddingBottom: 0 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
            <span style={{ fontSize: 12.5, color: b === max ? paper.orange : "#8a857b", fontWeight: b === max ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
              {b}
            </span>
            <div
              style={{
                width: "100%",
                height: `${(b / max) * 74}%`,
                borderRadius: "5px 5px 0 0",
                background: b === max ? paper.orange : "#d4cec2",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 7 }}>
        {bars.map((_, i) => (
          <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 12.5, color: "#8a857b" }}>
            W{i + 1}
          </span>
        ))}
      </div>
    </div>
  );
};

/** A macOS-flavored error dialog (alerts carry no title bar). */
export const ErrorDialog: React.FC<{ width?: number }> = ({ width = 520 }) => (
  <div
    style={{
      width,
      borderRadius: 16,
      background: "rgba(38,38,42,0.98)",
      border: `1.5px solid ${dark.whiteDim(12)}`,
      boxShadow: "0 30px 70px rgba(0,0,0,0.55)",
      padding: "28px 32px 24px",
      fontFamily: font.sans,
      color: dark.fg,
    }}
  >
    <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 13 }}>
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
    <div style={{ fontFamily: font.mono, fontSize: 16.5, lineHeight: 1.6, color: dark.mutedFg }}>
      code 3: missing column "Amount"
      <br />
      at export/csv.rs:214
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
      <span
        style={{
          padding: "7px 18px",
          borderRadius: 9,
          border: `1.5px solid ${dark.whiteDim(14)}`,
          fontSize: 16,
          color: dark.mutedFg,
        }}
      >
        Report…
      </span>
      <span
        style={{
          padding: "7px 22px",
          borderRadius: 9,
          background: dark.amber,
          color: dark.zinc900,
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        OK
      </span>
    </div>
  </div>
);

/** Result card that pops into the rail. */
export const RailCard: React.FC<{ label: string; file: string; body: string; appear: number; width?: number }> = ({
  label,
  file,
  body,
  appear,
  width = 400,
}) => {
  const e = easeOutBack(appear);
  return (
    <div
      style={{
        width,
        borderRadius: 14,
        background: dark.card,
        border: `1.5px solid ${dark.border}`,
        overflow: "hidden",
        opacity: appear,
        transform: `translateY(${(1 - e) * 34}px) scale(${mix(0.92, 1, e)})`,
        boxShadow: `0 18px 44px rgba(0,0,0,0.45), 0 0 24px ${dark.amberDim(6)}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "10px 16px",
          borderBottom: `1.5px solid ${dark.border}`,
          fontFamily: font.sans,
          fontSize: 14.5,
        }}
      >
        <span style={{ color: dark.amber, fontWeight: 600 }}>✓</span>
        <span style={{ color: dark.fg, fontWeight: 500 }}>{file}</span>
        <span style={{ marginLeft: "auto", color: dark.mutedFg }}>{label}</span>
      </div>
      <div
        style={{
          padding: "12px 16px",
          fontFamily: font.mono,
          fontSize: 14.5,
          lineHeight: 1.6,
          color: dark.fg,
          whiteSpace: "pre",
        }}
      >
        {body}
      </div>
    </div>
  );
};
