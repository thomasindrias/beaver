import { Mascot } from "./Mascot";

const POINTS = [
  {
    title: "You pay by the pixel",
    body: (
      <>
        Models bill images by their dimensions. A window screenshot runs about
        1,900 tokens before the model says a word.
        <sup>
          <a href="#src1" className="font-extrabold text-burn no-underline">
            1
          </a>
        </sup>{" "}
        The table inside it, as Markdown, is usually under 200.
      </>
    ),
  },
  {
    title: "The model reads a shrunk copy",
    body: (
      <>
        Big screenshots get downscaled before the model sees them.
        <sup>
          <a href="#src2" className="font-extrabold text-burn no-underline">
            2
          </a>
        </sup>{" "}
        The crisp 9-point numbers on your Retina display land below what the
        vision encoder can resolve.
      </>
    ),
  },
  {
    title: "It guesses, confidently",
    body: (
      <>
        When a model can't read a digit, it doesn't say so. It makes one up,
        in the same font as the real ones. Swapped columns and invented cells
        look exactly like data.
      </>
    ),
  },
];

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
  { text: "1× markdown table, exact", amount: "184 tk", kind: "calm" },
  { text: "· structure intact", amount: "incl.", kind: "fine" },
  { text: "· never left your mac", amount: "incl.", kind: "fine" },
  { text: "YOU SAVE", amount: "90%+ · every time", kind: "total" },
];

const ROW_STYLES: Record<string, string> = {
  "head-burn": "font-extrabold text-burn",
  "head-calm": "font-extrabold text-river-deep",
  burn: "text-burn",
  calm: "text-river-deep",
  fine: "text-[11.5px] font-normal text-muted",
  total: "text-sm font-extrabold",
};

export function ArgumentSection() {
  return (
    <section id="argument" className="bg-cream-deep">
      <div className="mx-auto max-w-[1040px] px-6 pt-[76px] pb-[84px]">
        <div className="mb-14 grid items-center gap-10 max-md:grid-cols-1 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="font-display text-[clamp(30px,4vw,46px)] leading-[1.05] font-extrabold">
              "Can't I just paste it into ChatGPT?"
            </h2>
            <p className="mt-3.5 max-w-[54ch] text-base text-bark-soft">
              You can, and for a meme it's fine. For data it's slow, pricier
              than it looks, and lossy in ways you don't see until a number is
              wrong. <strong className="text-ink">Here's the receipt.</strong>
            </p>
          </div>
          <div className="relative text-center">
            <span
              aria-hidden
              className="absolute top-0 right-[8%] rotate-8 rounded-[10px] border-[3px] border-orange-deep bg-cream/80 px-3 py-1.5 font-display text-[15px] font-[850] text-orange-deep italic"
            >
              no thanks
            </span>
            <Mascot
              mood="angry"
              alt="Beaver unimpressed by cloud uploads"
              className="inline-block w-[min(240px,70%)]"
            />
          </div>
        </div>

        <div className="grid items-start gap-12 max-md:grid-cols-1 md:grid-cols-[420px_1fr]">
          <div className="relative max-md:mx-auto max-md:max-w-[420px]">
            <span
              aria-hidden
              className="absolute top-[-13px] left-1/2 z-10 h-[26px] w-[92px] -translate-x-1/2 -rotate-3 border-x border-dashed border-ink/25 bg-sun/50"
            />
            <div
              role="img"
              aria-label="Receipt comparing the token cost of a screenshot against Beaver's Markdown output"
              className="-rotate-[1.4deg] border-[2.5px] border-ink bg-paper px-6 py-7 pb-5 font-mono text-[13px] leading-[1.9] font-semibold shadow-[0_6px_0_var(--color-ink)]"
            >
              <p className="text-center text-sm font-bold tracking-wider">
                *** YOUR TOKEN RECEIPT ***
              </p>
              <p className="mb-3.5 text-center text-[11px] font-normal text-muted">
                one table, sent to a vision model two ways
              </p>
              {RECEIPT_ROWS.map((row) => (
                <div key={row.text}>
                  {(row.kind === "head-calm" || row.kind === "total") && (
                    <div className="my-3 border-t-2 border-dashed border-line" />
                  )}
                  <div
                    className={`flex justify-between gap-3 ${ROW_STYLES[row.kind]}`}
                  >
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
              <p className="mt-3.5 text-center text-[11px] font-normal text-muted">
                thank you for reading the fine print
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4.5">
            {POINTS.map((point, i) => (
              <div key={point.title} className="card-sticker rounded-[14px] px-5 py-4.5">
                <h3 className="mb-1 text-[16.5px] font-extrabold">
                  <span className="mr-2 font-display text-[19px] text-burn">
                    {i + 1}
                  </span>
                  {point.title}
                </h3>
                <p className="text-[14.5px] text-bark-soft">{point.body}</p>
              </div>
            ))}
            <p className="border-l-4 border-burn py-1.5 pl-4.5 font-display text-[clamp(19px,2.4vw,24px)] leading-[1.4] font-bold italic">
              In one published evaluation, GPT-4V answered{" "}
              <span className="font-mono text-[0.85em] not-italic">
                35 of 50
              </span>{" "}
              table questions incorrectly.
              <sup>
                <a href="#src3" className="text-burn no-underline">
                  3
                </a>
              </sup>
            </p>
          </div>
        </div>

        <p className="mt-11 text-center text-[16.5px] text-bark-soft">
          Beaver reads the exact region you box, at full resolution, on your
          Mac.{" "}
          <strong className="text-ink">
            Your model gets exact text at a tenth of the tokens.
          </strong>{" "}
          Better input, better answers, smaller bill.
        </p>
      </div>
    </section>
  );
}
