import { Mascot } from "./Mascot";
import { Reveal } from "./Reveal";
import { Receipt } from "./Receipt";

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

export function ArgumentSection() {
  return (
    <section id="argument" className="bg-cream-deep">
      <div className="mx-auto max-w-[1040px] px-6 pt-[76px] pb-12">
        <div className="mb-14 grid items-center gap-10 max-md:grid-cols-1 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="font-display text-[clamp(30px,4vw,46px)] leading-[1.05] font-extrabold">
              "Can't I just paste it into ChatGPT?"
            </h2>
            <p className="mt-3.5 max-w-[54ch] text-body text-bark-soft">
              You can, and for a meme it's fine. For data it's slow, pricier
              than it looks, and lossy in ways you don't see until a number is
              wrong. <strong className="text-ink">Here's the receipt.</strong>
            </p>
          </div>
          <div className="relative text-center">
            <span
              aria-hidden
              className="absolute top-0 right-[8%] rotate-8 rounded-[10px] border-[3px] border-orange-deep bg-cream/80 px-3 py-1.5 font-display text-body-sm font-[850] text-orange-deep italic"
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
          <Reveal index={0}>
            <Receipt />
          </Reveal>

          <div className="flex flex-col gap-4.5">
            {POINTS.map((point, i) => (
              <Reveal
                key={point.title}
                index={i + 1}
                className="card-sticker lift-on-hover rounded-[14px] px-5 py-4.5"
              >
                <h3 className="mb-1 text-body font-extrabold">
                  <span className="mr-2 font-display text-[19px] text-burn">
                    {i + 1}
                  </span>
                  {point.title}
                </h3>
                <p className="text-body-sm text-bark-soft">{point.body}</p>
              </Reveal>
            ))}
            <Reveal index={POINTS.length + 1}>
              <p className="border-l-4 border-burn py-1.5 pl-4.5 font-display text-[clamp(19px,2.4vw,24px)] leading-[1.4] font-bold italic">
                A hallucinated digit prints in the exact same font as a real
                one. Nothing in the output tells you which is which.
              </p>
            </Reveal>
          </div>
        </div>

        <p className="mt-11 text-center text-body text-bark-soft">
          Beaver reads the exact region you box, at full resolution, on your
          Mac. The exact savings depend on the table, but the direction
          never flips:{" "}
          <strong className="text-ink">
            your model gets exact text at a tenth of the tokens.
          </strong>{" "}
          Better input, better answers, smaller bill.
        </p>
      </div>
    </section>
  );
}
