import { Mascot } from "./Mascot";
import { GITHUB_URL, RELEASES_URL } from "../constants";

export function FinalCta() {
  return (
    <div className="mx-auto max-w-[1040px] px-6 pt-10 pb-[100px] text-center">
      <Mascot
        mood="love"
        alt="Beaver with heart eyes"
        className="mb-1.5 inline-block w-[170px]"
      />
      <h2 className="mb-3 font-display text-[clamp(34px,4.6vw,54px)] leading-[1.05] font-extrabold">
        Give your Mac a beaver.
      </h2>
      <p className="mb-7 text-[17px] text-muted">
        Free, open source, and hungry for busywork.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3.5">
        <a
          href={RELEASES_URL}
          className="btn-push bg-orange px-6.5 py-3.5 text-white"
        >
          Download for Mac
        </a>
        <a href={GITHUB_URL} className="btn-push bg-paper px-6.5 py-3.5 text-ink">
          View on GitHub
        </a>
      </div>
    </div>
  );
}
