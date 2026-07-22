/** Exact tokens transcribed from src/index.css (app, dark world) and
 * apps/website/src/index.css (site, paper world). Chrome renders oklch()
 * natively, so the app values are used verbatim, not approximated. */
export const dark = {
  bg: "oklch(0.165 0.006 285)",
  card: "oklch(0.205 0.007 285)",
  popover: "oklch(0.19 0.007 285)",
  fg: "oklch(0.97 0.004 286)",
  mutedFg: "oklch(0.65 0.012 286)",
  border: "oklch(1 0 0 / 9%)",
  secondary: "oklch(0.27 0.008 285)",
  amber: "oklch(0.81 0.155 78)",
  amberFg: "oklch(0.2 0.03 60)",
  amberDim: (a: number) => `oklch(0.81 0.155 78 / ${a}%)`,
  whiteDim: (a: number) => `oklch(1 0 0 / ${a}%)`,
  pillBg: "rgba(24, 24, 27, 0.9)",
  zinc400: "#a1a1aa",
  zinc900: "#18181b",
} as const;

export const paper = {
  cream: "#fdf6ec",
  creamDeep: "#f2e4c8",
  paper: "#fffdf9",
  line: "#e8dfd0",
  ink: "#2b2019",
  bark: "#3b2a1d",
  barkSoft: "#5a4432",
  muted: "#7d6c58",
  orange: "#dd6b27",
  river: "#2e7d74",
  sun: "#f4a83c",
} as const;

export const font = {
  sans: '"Geist Variable", ui-sans-serif, -apple-system, system-ui, sans-serif',
  display: '"Fraunces Variable", Georgia, serif',
  mono: '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace',
} as const;
