import { Mascot } from "./Mascot";
import { Reveal } from "./Reveal";

const PAINS = [
  {
    tag: "spreadsheet people",
    title: "The PDF table",
    body: "Forty rows of numbers in a report. You need them in Sheets. Your options: retype, or squint at word soup from copy-paste.",
  },
  {
    tag: "developers",
    title: "Code in a video",
    body: "The tutorial shows exactly the config you need. Pause. Type. Rewind. Type. Miss a bracket. Debug for ten minutes.",
  },
  {
    tag: "meeting havers",
    title: "Slides on a call",
    body: "The numbers were on screen for eight seconds. You ask for the deck. The deck never comes.",
  },
  {
    tag: "finance folks",
    title: "The invoice pile",
    body: "Amounts and references that belong in your books, in documents you would never upload to a chatbot.",
  },
];

export function PainSection() {
  return (
    <section className="bg-river text-[#eefaf7]">
      <div className="mx-auto max-w-[1040px] px-6 pt-8 pb-[70px]">
        <div className="mb-10 flex flex-wrap items-center gap-6">
          <Mascot mood="crying" alt="Beaver in tears" className="w-[110px]" />
          <div>
            <h2 className="font-display text-[clamp(30px,4vw,46px)] leading-[1.05] font-extrabold">
              The busywork nobody signed up for
            </h2>
            <p className="max-w-[480px] text-body text-[#dff3ee]">
              Information you can see but can't use, so you type it out again.
              Sound familiar?
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
          {PAINS.map((pain, i) => (
            <Reveal
              key={pain.title}
              index={i}
              testId="pain-sticker"
              className={[
                "lift-on-hover rounded-2xl border-[2.5px] border-ink bg-paper p-5 text-ink shadow-[var(--shadow-sticker)]",
                i % 2 === 0 ? "-rotate-1" : "rotate-1",
              ].join(" ")}
            >
              <span className="mb-2.5 inline-block rounded-md bg-[#d9efe9] px-2 py-0.5 text-2xs font-extrabold tracking-wider text-river-deep uppercase">
                {pain.tag}
              </span>
              <h3 className="mb-1.5 text-body font-extrabold">
                {pain.title}
              </h3>
              <p className="text-body-sm text-bark-soft">{pain.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
