import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { dark, font, paper } from "../theme";
import { charsAt } from "../lib/typeon";
import { ep, easeOutCubic } from "../lib/ease";
import { LetterReveal, Rise, WordRise } from "./text";

/** macOS-style window chrome: traffic lights + title bar. Wrapping a
 * source in this reads instantly as "a thing on your screen". */
export const Window: React.FC<{
  title: string;
  width?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ title, width, children, style }) => (
  <div
    style={{
      width,
      borderRadius: 14,
      overflow: "hidden",
      border: `1.5px solid ${dark.whiteDim(11)}`,
      background: dark.card,
      boxShadow: "0 34px 80px rgba(0,0,0,0.55)",
      ...style,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "11px 16px",
        background: "rgba(255,255,255,0.045)",
        borderBottom: `1.5px solid ${dark.whiteDim(8)}`,
      }}
    >
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <span
          key={c}
          style={{ width: 12, height: 12, borderRadius: 99, background: c, opacity: 0.75 }}
        />
      ))}
      <span
        style={{
          flex: 1,
          textAlign: "center",
          marginRight: 56,
          fontFamily: font.sans,
          fontSize: 15.5,
          color: dark.mutedFg,
        }}
      >
        {title}
      </span>
    </div>
    {children}
  </div>
);

/** The invoice used across variants. Concrete, a little beaver-flavored,
 * never a lorem placeholder. */
export const INVOICE_ROWS = [
  ["2026-06-03", "Oak planks", "12", "$384.00"],
  ["2026-06-11", "River stone, bulk", "2", "$210.50"],
  ["2026-06-19", "Mud sealant", "5", "$97.25"],
] as const;
export const INVOICE_TOTAL = "$691.75";

export const MD_LINES = [
  "| Date       | Description       | Qty | Amount  |",
  "|------------|-------------------|-----|---------|",
  "| 2026-06-03 | Oak planks        | 12  | $384.00 |",
  "| 2026-06-11 | River stone, bulk | 2   | $210.50 |",
  "| 2026-06-19 | Mud sealant       | 5   | $97.25  |",
  "| **Total**  |                   |     | $691.75 |",
];

export const CSV_LINES = [
  "Date,Description,Qty,Amount",
  "2026-06-03,Oak planks,12,384.00",
  '2026-06-11,"River stone, bulk",2,210.50',
  "2026-06-19,Mud sealant,5,97.25",
  "Total,,,691.75",
];

export const JSON_LINES = [
  "[",
  '  { "date": "2026-06-03", "item": "Oak planks",        "amount": 384.00 },',
  '  { "date": "2026-06-11", "item": "River stone, bulk", "amount": 210.50 },',
  '  { "date": "2026-06-19", "item": "Mud sealant",       "amount": 97.25 }',
  "]",
];

/** A paper invoice, the thing you can see but not use. `mode` flips the
 * palette between the cream world and a neutral screenshot-on-dark. */
export const InvoiceDoc: React.FC<{
  width?: number;
  mode?: "paper" | "dark";
  style?: React.CSSProperties;
}> = ({ width = 760, mode = "paper", style }) => {
  const onPaper = mode === "paper";
  const ink = onPaper ? paper.ink : dark.fg;
  const mut = onPaper ? paper.muted : dark.mutedFg;
  const line = onPaper ? paper.line : "rgba(255,255,255,0.09)";
  return (
    <div
      style={{
        width,
        background: onPaper ? paper.paper : dark.card,
        border: onPaper ? `2px solid ${paper.line}` : `1.5px solid ${dark.border}`,
        borderRadius: 14,
        boxShadow: onPaper
          ? "0 22px 60px rgba(43,32,25,0.18)"
          : "0 30px 70px rgba(0,0,0,0.5)",
        padding: "40px 46px",
        fontFamily: font.sans,
        color: ink,
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: onPaper ? font.display : font.sans, fontSize: 30, fontWeight: 600 }}>
          Invoice #2041
        </div>
        <div style={{ fontSize: 18, color: mut }}>Lodge &amp; Timber Co.</div>
      </div>
      <div style={{ height: 2, background: line, margin: "22px 0 6px" }} />
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 20 }}>
        <thead>
          <tr>
            {["Date", "Description", "Qty", "Amount"].map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: i >= 2 ? "right" : "left",
                  color: mut,
                  fontWeight: 500,
                  padding: "12px 4px",
                  borderBottom: `2px solid ${line}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {INVOICE_ROWS.map((r) => (
            <tr key={r[0]}>
              {r.map((cell, i) => (
                <td
                  key={i}
                  style={{
                    padding: "12px 4px",
                    textAlign: i >= 2 ? "right" : "left",
                    borderBottom: `1.5px solid ${line}`,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td style={{ padding: "14px 4px", fontWeight: 600 }}>Total</td>
            <td />
            <td />
            <td
              style={{
                padding: "14px 4px",
                textAlign: "right",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {INVOICE_TOTAL}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

/** Dark output card whose mono content types itself line by line. */
export const DocCard: React.FC<{
  lines: string[];
  start: number;
  cps?: number;
  width?: number;
  title?: string;
  fontSize?: number;
  appear?: number;
  style?: React.CSSProperties;
}> = ({ lines, start, cps = 60, width = 900, title, fontSize = 21, appear = 1, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const joined = lines.join("\n");
  const n = charsAt(frame, start, cps, fps, joined.length);
  const shown = joined.slice(0, n);
  return (
    <div
      style={{
        width,
        background: dark.card,
        border: `1.5px solid ${dark.border}`,
        borderRadius: 16,
        boxShadow: `0 30px 70px rgba(0,0,0,0.5), 0 0 40px ${dark.amberDim(6)}`,
        overflow: "hidden",
        opacity: appear,
        transform: `translateY(${(1 - appear) * 18}px)`,
        ...style,
      }}
    >
      {title ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 20px",
            borderBottom: `1.5px solid ${dark.border}`,
            fontFamily: font.sans,
            fontSize: 17,
            color: dark.mutedFg,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 99,
              background: dark.amber,
            }}
          />
          {title}
        </div>
      ) : null}
      <pre
        style={{
          margin: 0,
          padding: "22px 26px",
          fontFamily: font.mono,
          fontSize,
          lineHeight: 1.65,
          color: dark.fg,
          whiteSpace: "pre",
        }}
      >
        {shown.split("\n").map((l, i) => (
          <div key={i}>
            {/* Dim structural punctuation so data reads first. */}
            {l.split(/([|,{}[\]])/).map((seg, j) =>
              /^[|,{}[\]]$/.test(seg) ? (
                <span key={j} style={{ color: dark.amberDim(55) }}>
                  {seg}
                </span>
              ) : (
                <span key={j}>{seg}</span>
              ),
            )}
          </div>
        ))}
      </pre>
    </div>
  );
};

/** Shared ending: app icon lands, wordmark reveals, tag lines follow.
 * The icon itself fades sharp out of the particle cloud the caller drives. */
export const IconFinale: React.FC<{
  start: number;
  iconAt: { x: number; y: number; size: number };
  tagline?: string;
  subline?: string;
  wordmark?: boolean;
}> = ({ start, iconAt, tagline, subline, wordmark = true }) => {
  const frame = useCurrentFrame();
  const sharp = ep(frame, start, start + 18, easeOutCubic);
  const settle = ep(frame, start, start + 26, easeOutCubic);
  return (
    <>
      <Img
        src={staticFile("beaver-icon.png")}
        style={{
          position: "absolute",
          left: iconAt.x,
          top: iconAt.y + (1 - settle) * 10,
          width: iconAt.size,
          height: iconAt.size,
          opacity: sharp,
          filter: `drop-shadow(0 0 ${34 * (1 - sharp) + 14}px ${dark.amberDim(35)})`,
        }}
      />
      {wordmark && (
        <div
          style={{
            position: "absolute",
            left: iconAt.x + iconAt.size + 34,
            top: iconAt.y + iconAt.size * 0.5,
            transform: "translateY(-50%)",
            fontFamily: font.sans,
            fontSize: iconAt.size * 0.62,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: dark.fg,
          }}
        >
          <LetterReveal text="Beaver" start={start + 8} perLetter={3} />
        </div>
      )}
      {tagline ? (
        <WordRise
          text={tagline}
          start={start + 34}
          perWord={4}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: iconAt.y + iconAt.size + 74,
            textAlign: "center",
            fontFamily: font.sans,
            fontSize: 40,
            fontWeight: 500,
            color: dark.fg,
          }}
        />
      ) : null}
      {subline ? (
        <Rise
          start={start + 48}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: iconAt.y + iconAt.size + 138,
            textAlign: "center",
            fontFamily: font.sans,
            fontSize: 24,
            color: dark.mutedFg,
          }}
        >
          {subline}
        </Rise>
      ) : null}
    </>
  );
};
