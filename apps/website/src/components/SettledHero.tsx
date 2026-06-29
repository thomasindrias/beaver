import { brandAssets, heroCopy, RELEASES_URL } from "../constants";

interface SettledHeroProps {
  autoPlayVideo: boolean;
}

export function SettledHero({ autoPlayVideo }: SettledHeroProps) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 text-center">
      <video
        className="h-auto w-64 sm:w-80"
        src={brandAssets.wave}
        autoPlay={autoPlayVideo}
        muted
        playsInline
        aria-hidden="true"
      />
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        {heroCopy.headline}
      </h1>
      <p className="max-w-md text-base text-[var(--color-ink-muted)] sm:text-lg">
        {heroCopy.subhead}
      </p>
      <a
        href={RELEASES_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-[var(--color-accent)] px-8 py-3 text-base font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
      >
        {heroCopy.cta}
      </a>
      <p className="text-sm text-[var(--color-ink-muted)]">
        {heroCopy.qualifier}
      </p>
    </div>
  );
}
