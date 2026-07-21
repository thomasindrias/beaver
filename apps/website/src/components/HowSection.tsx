import { Mascot } from "./Mascot";

const STEPS = [
  {
    title: (
      <>
        Press{" "}
        <kbd className="rounded-md border-[1.5px] border-b-[3px] border-ink bg-cream-deep px-1.5 py-0.5 font-mono text-[13px]">
          ⌘⇧D
        </kbd>
      </>
    ),
    body: "A capture overlay appears over anything: apps, videos, shared screens.",
  },
  {
    title: "Box the thing you need",
    body: "Just the table. Just the code. Beaver reads exactly what you picked, at full resolution.",
  },
  {
    title: "Paste it anywhere",
    body: "Clean Markdown on your clipboard. Tables stay tables, code keeps its indentation.",
  },
];

const EXHIBIT_MARKDOWN = `| Plan     | Seats | Price   |
| -------- | ----- | ------- |
| Starter  | 1     | $0      |
| Team     | 10    | $49/mo  |
| Business | 50    | $189/mo |`;

export function HowSection() {
  return (
    <section id="how" className="mx-auto max-w-[1040px] px-6 pt-[84px] pb-[84px]">
      <div className="mb-16 grid items-center gap-10 max-md:grid-cols-1 md:grid-cols-[0.9fr_1.1fr]">
        <div className="text-center">
          <Mascot
            mood="playful"
            alt="Playful beaver"
            className="inline-block w-[min(260px,70%)]"
          />
        </div>
        <div>
          <h2 className="mb-5 font-display text-[clamp(30px,4vw,46px)] leading-[1.05] font-extrabold">
            One drag. Dam, done.
          </h2>
          {STEPS.map((step, i) => (
            <div
              key={i}
              data-testid="step"
              className="card-sticker mb-3.5 flex items-start gap-4 rounded-[14px] px-5 py-4.5"
            >
              <span className="w-[34px] flex-none font-display text-[26px] leading-none font-[850] text-orange">
                {i + 1}
              </span>
              <div>
                <h3 className="mb-0.5 text-[16.5px] font-extrabold">
                  {step.title}
                </h3>
                <p className="text-[14.5px] text-bark-soft">{step.body}</p>
              </div>
            </div>
          ))}
          <p className="mt-2 text-[14.5px] font-bold text-river-deep">
            The vision model lives on your Mac. No upload, no waiting, no
            meter.
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-[880px] items-center gap-3.5 max-md:grid-cols-1 md:grid-cols-[1fr_56px_1fr]">
        <figure className="card-sticker -rotate-1 p-4 shadow-[0_5px_0_var(--color-ink)] max-md:rotate-0">
          <span className="mb-3 inline-block rounded-md bg-[#fdeadd] px-2 py-0.5 text-xs font-extrabold tracking-wider text-orange-deep uppercase">
            on your screen
          </span>
          <div className="overflow-hidden rounded-lg border-[1.5px] border-line text-xs">
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
          className="rotate-1 rounded-2xl border-[2.5px] border-bark bg-ink p-4 shadow-[0_5px_0_rgba(43,32,25,0.45)] max-md:rotate-0"
        >
          <span className="mb-3 inline-block rounded-md bg-[#443428] px-2 py-0.5 text-xs font-extrabold tracking-wider text-sun uppercase">
            on your clipboard
          </span>
          <pre className="overflow-x-auto font-mono text-xs leading-[1.8] text-[#f3e9db]">
            {EXHIBIT_MARKDOWN}
          </pre>
        </figure>
      </div>
      <p className="mt-5 text-center text-sm text-muted">
        Paste it into Excel, Notion, Obsidian, or a chat with your favorite
        model. It's text now. It behaves.
      </p>
    </section>
  );
}
