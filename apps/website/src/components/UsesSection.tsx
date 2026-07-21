import { Mascot } from "./Mascot";
import { Reveal } from "./Reveal";

const CHIPS = [
  "PDF tables",
  "Video tutorials",
  "Error dialogs",
  "Meeting slides",
  "Legacy apps with no copy button",
  "Whiteboard photos",
  "Any screenshot, straight to your AI",
];

export function UsesSection() {
  return (
    <section className="mx-auto max-w-[1040px] px-6 pt-[64px] pb-[50px] text-center">
      <Mascot
        mood="happy"
        alt="Happy beaver"
        className="mb-2 inline-block w-[72px]"
      />
      <h2 className="font-display text-[clamp(26px,3.4vw,38px)] leading-[1.05] font-extrabold">
        It doesn't care where it came from.
      </h2>
      <p className="mx-auto mt-2 mb-7 max-w-[480px] text-body-sm text-muted">
        If you can see it, you can grab it.
      </p>
      <div className="mx-auto flex max-w-[640px] flex-wrap justify-center gap-2.5">
        {CHIPS.map((chip, i) => (
          <Reveal
            key={chip}
            index={i}
            testId="use-case"
            className="rounded-full border-2 border-ink bg-paper px-4 py-2 text-body-sm font-bold shadow-[0_3px_0_var(--color-ink)]"
          >
            {chip}
          </Reveal>
        ))}
      </div>
    </section>
  );
}
