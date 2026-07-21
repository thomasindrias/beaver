import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useInView } from "../hooks/useInView";

type FormatKey = "markdown" | "csv" | "json" | "plain" | "custom";
type Phase = "selecting" | "typing" | "done";

const FORMATS: Array<{ key: FormatKey; label: string }> = [
  { key: "markdown", label: "Markdown" },
  { key: "csv", label: "CSV" },
  { key: "json", label: "JSON" },
  { key: "plain", label: "Plain" },
  { key: "custom", label: "Custom" },
];

const OUTPUTS: Record<Exclude<FormatKey, "custom">, string> = {
  markdown: `| Plan     | Seats | Price   |
| -------- | ----- | ------- |
| Starter  | 1     | $0      |
| Team     | 10    | $49/mo  |
| Business | 50    | $189/mo |`,
  csv: `Plan,Seats,Price
Starter,1,$0
Team,10,$49/mo
Business,50,$189/mo`,
  json: `[
  { "Plan": "Starter", "Seats": "1", "Price": "$0" },
  { "Plan": "Team", "Seats": "10", "Price": "$49/mo" },
  { "Plan": "Business", "Seats": "50", "Price": "$189/mo" }
]`,
  // Deliberately the odd one out: plain text has nowhere to put structure,
  // so the table flattens into a sentence — the same "word soup" the rest
  // of the page argues against.
  plain:
    "Starter — 1 seat, $0. Team — 10 seats, $49/mo. Business — 50 seats, $189/mo.",
};

const CUSTOM_PLACEHOLDER = "Type an instruction, then press enter.";

// A handful of recognizable instructions, answered deterministically. This
// is a marketing-page demo, not a live model — when it doesn't recognize
// the instruction it says so, rather than guessing. That's the same
// argument the rest of the section makes about confident wrong answers.
function resolveCustomPrompt(raw: string): string {
  const prompt = raw.trim().toLowerCase();
  if (!prompt) return CUSTOM_PLACEHOLDER;
  if (/total|sum/.test(prompt)) return "Total seats across all plans: 61.";
  if (/cheap|free|lowest/.test(prompt))
    return "Starter — $0. The only free plan.";
  if (/expensive|priciest|highest/.test(prompt))
    return "Business — $189/mo. The top plan.";
  if (/spanish|español/.test(prompt))
    return `Plan     Puestos  Precio
Inicial  1        $0
Equipo   10       $49/mes
Empresa  50       $189/mes`;
  if (/french|français/.test(prompt))
    return `Plan        Places  Prix
Initial     1       0 $
Équipe      10      49 $/mois
Entreprise  50      189 $/mois`;
  if (/price|cost/.test(prompt)) return "$0 · $49/mo · $189/mo";
  return 'This demo only knows a few instructions — try "total," "cheapest," "translate to Spanish," or "just the prices." The real Beaver runs your exact words against the model on your Mac.';
}

const SELECT_DELAY_MS = 500;
const TYPE_INTERVAL_MS = 24;
const CHARS_PER_TICK = 6;

export function CaptureDemo() {
  const { ref: boxRef, inView, prefersReducedMotion } = useInView<HTMLDivElement>(0.4);
  const [format, setFormat] = useState<FormatKey>("markdown");
  const [phase, setPhase] = useState<Phase>("selecting");
  const [typed, setTyped] = useState("");
  const [replayKey, setReplayKey] = useState(0);
  const [customPrompt, setCustomPrompt] = useState("");

  // Effect below intentionally doesn't depend on `format` — switching
  // format alone shouldn't redraw the selection box, only a fresh capture
  // or an explicit replay should. This ref lets it read the latest pick.
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  // Run (or replay) the select-then-type sequence, once in view.
  useEffect(() => {
    const text =
      formatRef.current === "custom"
        ? CUSTOM_PLACEHOLDER
        : OUTPUTS[formatRef.current];

    if (prefersReducedMotion) {
      setPhase("done");
      setTyped(text);
      return;
    }
    if (!inView) return;

    setPhase("selecting");
    setTyped("");

    let typeTimer: ReturnType<typeof setInterval> | undefined;
    const selectTimer = setTimeout(() => {
      setPhase("typing");
      let i = 0;
      typeTimer = setInterval(() => {
        i += CHARS_PER_TICK;
        setTyped(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(typeTimer);
          setPhase("done");
        }
      }, TYPE_INTERVAL_MS);
    }, SELECT_DELAY_MS);

    return () => {
      clearTimeout(selectTimer);
      if (typeTimer) clearInterval(typeTimer);
    };
  }, [prefersReducedMotion, inView, replayKey]);

  const selecting =
    !prefersReducedMotion && (phase === "selecting" || phase === "typing");
  const settled = phase === "done";

  function pickFormat(next: FormatKey) {
    setFormat(next);
    if (next === "custom") {
      setCustomPrompt("");
      setTyped(CUSTOM_PLACEHOLDER);
    } else {
      setTyped(OUTPUTS[next]);
    }
  }

  function runCustomPrompt() {
    setTyped(resolveCustomPrompt(customPrompt));
  }

  return (
    <div className="mx-auto grid max-w-[880px] items-center gap-3.5 max-md:grid-cols-1 md:grid-cols-[1fr_56px_1fr]">
      <figure
        ref={boxRef}
        className="card-sticker -rotate-1 min-w-0 p-4 max-md:rotate-0"
      >
        <span className="mb-3 inline-block rounded-md bg-[#fdeadd] px-2 py-0.5 text-xs font-extrabold tracking-wider text-orange-deep uppercase">
          on your screen
        </span>
        <div className="relative overflow-hidden rounded-lg border-[1.5px] border-line text-xs">
          <div className="bg-[#efe7d8] px-2.5 py-1 text-2xs text-muted">
            plans.pdf · page 3 of 12 · read-only
          </div>
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr>
                {["Plan", "Seats", "Price"].map((h) => (
                  <th
                    key={h}
                    className="border-b border-[#f0e9dc] bg-[#f8f3e8] px-2 py-1.5 text-left font-bold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Starter", "1", "$0"],
                ["Team", "10", "$49/mo"],
                ["Business", "50", "$189/mo"],
              ].map((row) => (
                <tr key={row[0]}>
                  {row.map((cell) => (
                    <td
                      key={cell}
                      className="border-b border-[#f0e9dc] px-2 py-1.5 text-left"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {selecting && (
            <div
              aria-hidden
              className="capture-select-box pointer-events-none absolute inset-1 rounded-md border-2 border-dashed border-orange"
            />
          )}
        </div>
      </figure>
      <div
        aria-hidden
        className="text-center text-3xl font-extrabold text-orange max-md:rotate-90"
      >
        →
      </div>
      <figure
        data-testid="exhibit-output"
        className="rotate-1 min-w-0 rounded-2xl border-[2.5px] border-bark bg-ink p-4 shadow-[var(--shadow-sticker-dark)] max-md:rotate-0"
      >
        <span className="mb-3 inline-block rounded-md bg-[#443428] px-2 py-0.5 text-xs font-extrabold tracking-wider text-sun uppercase">
          on your clipboard
        </span>
        <div
          role="group"
          aria-label="Output format"
          className="mb-2.5 flex flex-wrap gap-1.5"
        >
          {FORMATS.map((f) => {
            const active = format === f.key;
            return (
              <button
                key={f.key}
                type="button"
                disabled={!settled}
                aria-pressed={active}
                onClick={() => pickFormat(f.key)}
                className={[
                  "rounded-full border px-2.5 py-1 text-2xs font-bold transition-colors",
                  active
                    ? "border-sun bg-sun/15 text-sun"
                    : "border-[#5a4a3a] text-[#c9bda9]",
                  settled ? "hover:text-sun" : "cursor-default opacity-40",
                ].join(" ")}
              >
                {f.key === "custom" && (
                  <Sparkles aria-hidden className="mr-1 inline-block h-3 w-3 align-[-1px]" />
                )}
                {f.label}
              </button>
            );
          })}
        </div>
        {format === "custom" && (
          <div className="mb-2.5 flex gap-1.5">
            <input
              type="text"
              value={customPrompt}
              disabled={!settled}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runCustomPrompt();
              }}
              placeholder="e.g. just the totals"
              className="min-w-0 flex-1 rounded-md border border-[#5a4a3a] bg-[#1c1712] px-2.5 py-1.5 text-2xs text-[#f3e9db] placeholder:text-[#8a7c68] focus:border-sun focus:outline-none"
            />
            <button
              type="button"
              onClick={runCustomPrompt}
              disabled={!settled}
              aria-label="Run instruction"
              className="flex items-center justify-center rounded-md border border-sun bg-sun/15 px-2.5 text-sun disabled:opacity-40"
            >
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <pre className="scrollbar-ink h-[9em] overflow-auto font-mono text-xs leading-[1.8] whitespace-pre-wrap text-[#f3e9db]">
          {typed}
          {phase !== "done" && !prefersReducedMotion && (
            <span
              aria-hidden
              className="capture-caret -mb-[2px] ml-px inline-block h-[1em] w-[6px] bg-sun align-text-bottom"
            />
          )}
        </pre>
        {!prefersReducedMotion && (
          <button
            type="button"
            onClick={() => setReplayKey((k) => k + 1)}
            className="mt-3 text-2xs font-semibold text-sun/70 hover:text-sun"
          >
            ↻ Replay capture
          </button>
        )}
      </figure>
    </div>
  );
}
