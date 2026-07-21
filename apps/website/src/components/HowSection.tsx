import { Mascot } from "./Mascot";
import { Reveal } from "./Reveal";
import { CaptureDemo } from "./CaptureDemo";

const STEPS = [
  {
    title: (
      <>
        Press{" "}
        <kbd className="rounded-md border-[1.5px] border-b-[3px] border-ink bg-cream-deep px-1.5 py-0.5 font-mono text-caption">
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
            <Reveal
              key={i}
              index={i}
              testId="step"
              className="card-sticker lift-on-hover mb-3.5 flex items-start gap-4 rounded-[14px] px-5 py-4.5"
            >
              <span className="w-[34px] flex-none font-display text-[26px] leading-none font-[850] text-orange">
                {i + 1}
              </span>
              <div>
                <h3 className="mb-0.5 text-body font-extrabold">
                  {step.title}
                </h3>
                <p className="text-body-sm text-bark-soft">{step.body}</p>
              </div>
            </Reveal>
          ))}
          <p className="mt-2 text-body-sm font-bold text-river-deep">
            The vision model lives on your Mac. No upload, no waiting, no
            meter.
          </p>
        </div>
      </div>

      <CaptureDemo />
      <p className="mt-5 text-center text-body-sm text-muted">
        Pick the shape you need. Markdown's pipes disappear into real
        columns the moment you paste into Excel or Sheets. CSV and JSON
        feed straight into a script. Plain text stays plain text in a
        chat with your model.
      </p>
    </section>
  );
}
