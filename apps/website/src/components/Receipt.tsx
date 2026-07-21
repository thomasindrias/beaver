import { useInView } from "../hooks/useInView";

const RECEIPT_ROWS: Array<{
  text: string;
  amount: string;
  kind: "head-burn" | "head-calm" | "burn" | "calm" | "fine" | "total";
}> = [
  { text: "ATTACH SCREENSHOT", amount: "", kind: "head-burn" },
  { text: "1× window shot, 1440×900", amount: "1,928 tk", kind: "burn" },
  { text: "· downscaled before reading", amount: "incl.", kind: "fine" },
  { text: "· illegible digits guessed", amount: "incl.", kind: "fine" },
  { text: "· uploaded to a datacenter", amount: "incl.", kind: "fine" },
  { text: "SAME TABLE, VIA BEAVER", amount: "", kind: "head-calm" },
  { text: "1× markdown table, this size", amount: "184 tk", kind: "calm" },
  { text: "· structure intact", amount: "incl.", kind: "fine" },
  { text: "· never left your mac", amount: "incl.", kind: "fine" },
  { text: "YOU SAVE", amount: "usually 90%+", kind: "total" },
];

const ROW_STYLES: Record<string, string> = {
  "head-burn": "font-extrabold text-burn",
  "head-calm": "font-extrabold text-river-deep",
  burn: "text-burn",
  calm: "text-river-deep",
  fine: "text-2xs font-normal text-muted",
  total: "text-sm font-extrabold",
};

const ROW_DELAY_MS = 90;
const MAX_DELAY_STEPS = 9;

export function Receipt() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div ref={ref} className="relative max-md:mx-auto max-md:max-w-[420px]">
      <span
        aria-hidden
        className="absolute top-[-13px] left-1/2 z-10 h-[26px] w-[92px] -translate-x-1/2 -rotate-3 border-x border-dashed border-ink/25 bg-sun/50"
      />
      <div
        role="img"
        aria-label="Receipt comparing the token cost of a screenshot against Beaver's Markdown output"
        className={[
          "lift-on-hover -rotate-[1.4deg] border-[2.5px] border-ink bg-paper px-6 py-7 pb-5 font-mono text-caption leading-[1.9] font-semibold shadow-[var(--shadow-sticker-lg)] transition-opacity duration-500",
          inView ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        <p className="text-center text-sm font-bold tracking-wider">
          *** YOUR TOKEN RECEIPT ***
        </p>
        <p className="mb-3.5 text-center text-2xs font-normal text-muted">
          one table, sent to a vision model two ways
        </p>
        {RECEIPT_ROWS.map((row, i) => (
          <div
            key={row.text}
            data-testid="receipt-row"
            data-visible={inView}
            className={[
              "transition-all duration-300 ease-out",
              inView ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            ].join(" ")}
            style={{
              transitionDelay: `${Math.min(i, MAX_DELAY_STEPS) * ROW_DELAY_MS}ms`,
            }}
          >
            {(row.kind === "head-calm" || row.kind === "total") && (
              <div className="my-3 border-t-2 border-dashed border-line" />
            )}
            <div className={`flex justify-between gap-3 ${ROW_STYLES[row.kind]}`}>
              <span>{row.text}</span>
              {row.amount && (
                <>
                  <span className="-translate-y-[5px] flex-1 border-b-2 border-dotted border-line" />
                  <span className="whitespace-nowrap tabular-nums">
                    {row.amount}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
        <p className="mt-3.5 text-center text-2xs font-normal text-muted">
          a full window, not a tight crop — crop closer, save more. thanks
          for reading the fine print.
        </p>
      </div>
    </div>
  );
}
