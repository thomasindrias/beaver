import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const MARKDOWN = `| Plan     | Seats | Price   |
| -------- | ----- | ------- |
| Starter  | 1     | $0      |
| Team     | 10    | $49/mo  |
| Business | 50    | $189/mo |`;

const SELECT_DELAY_MS = 500;
const TYPE_INTERVAL_MS = 24;
const CHARS_PER_TICK = 6;

type Phase = "selecting" | "typing" | "done";

export function CaptureDemo() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [phase, setPhase] = useState<Phase>("selecting");
  const [typed, setTyped] = useState("");
  const [replayKey, setReplayKey] = useState(0);

  // Wait until the demo scrolls into view before starting the capture.
  useEffect(() => {
    if (prefersReducedMotion || inView) return;
    const node = boxRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [prefersReducedMotion, inView]);

  // Run (or replay) the select-then-type sequence.
  useEffect(() => {
    if (prefersReducedMotion) {
      setPhase("done");
      setTyped(MARKDOWN);
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
        setTyped(MARKDOWN.slice(0, i));
        if (i >= MARKDOWN.length) {
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

  return (
    <div className="mx-auto grid max-w-[880px] items-center gap-3.5 max-md:grid-cols-1 md:grid-cols-[1fr_56px_1fr]">
      <figure
        ref={boxRef}
        className="card-sticker -rotate-1 p-4 max-md:rotate-0"
      >
        <span className="mb-3 inline-block rounded-md bg-[#fdeadd] px-2 py-0.5 text-xs font-extrabold tracking-wider text-orange-deep uppercase">
          on your screen
        </span>
        <div className="relative overflow-hidden rounded-lg border-[1.5px] border-line text-xs">
          <div className="bg-[#efe7d8] px-2.5 py-1 text-[10.5px] text-muted">
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
        data-testid="exhibit-markdown"
        className="rotate-1 rounded-2xl border-[2.5px] border-bark bg-ink p-4 shadow-[var(--shadow-sticker-dark)] max-md:rotate-0"
      >
        <span className="mb-3 inline-block rounded-md bg-[#443428] px-2 py-0.5 text-xs font-extrabold tracking-wider text-sun uppercase">
          on your clipboard
        </span>
        <pre className="min-h-[8.6em] overflow-x-auto font-mono text-xs leading-[1.8] whitespace-pre text-[#f3e9db]">
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
            className="mt-3 text-[11.5px] font-semibold text-sun/70 hover:text-sun"
          >
            ↻ Replay capture
          </button>
        )}
      </figure>
    </div>
  );
}
