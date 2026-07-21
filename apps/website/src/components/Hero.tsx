import { Mascot } from "./Mascot";
import { QUALIFIER, RELEASES_URL } from "../constants";

export function Hero() {
  return (
    <header className="mx-auto grid max-w-[1040px] items-center gap-8 px-6 pt-12 max-md:grid-cols-1 md:grid-cols-[1.15fr_0.85fr]">
      <div>
        <h1 className="mb-5 font-display text-[clamp(44px,6.6vw,76px)] leading-[0.98] font-[850] tracking-tight">
          Stop <em className="font-semibold text-orange">retyping</em> your
          screen.
        </h1>
        <p className="mb-7 max-w-[480px] text-body-lg text-bark-soft">
          Tables in PDFs. Code in videos. Slides on calls. You can see the
          data, you just can't copy it.{" "}
          <strong className="text-ink">Beaver can.</strong> One drag, and it's
          clean Markdown on your clipboard. All on your Mac, nothing uploaded.
        </p>
        <div className="flex flex-wrap items-center gap-3.5">
          <a
            href={RELEASES_URL}
            className="btn-push bg-orange px-6.5 py-3.5 text-white"
          >
            Download for Mac
          </a>
          <a href="#how" className="btn-push bg-paper px-6.5 py-3.5 text-ink">
            See how it works
          </a>
        </div>
        <p className="mt-3.5 text-caption font-semibold text-muted">
          {QUALIFIER}
        </p>
      </div>
      <div className="relative text-center max-md:order-first">
        <span
          aria-hidden
          className="bubble-tail absolute top-[-12px] right-[4%] rotate-3 rounded-2xl border-[2.5px] border-ink bg-paper px-4 py-2.5 text-body-sm font-extrabold shadow-[0_4px_0_var(--color-ink)]"
        >
          Drag a box around anything.
        </span>
        <Mascot
          mood="wave"
          alt="Beaver waving hello"
          eager
          className="inline-block w-[min(320px,80%)] max-md:w-[min(220px,60%)]"
        />
      </div>
    </header>
  );
}
