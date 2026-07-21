import { BrandMark } from "./BrandMark";
import { GITHUB_URL, RELEASES_URL } from "../constants";
import { useScrolled } from "../hooks/useScrolled";

export function Nav() {
  const scrolled = useScrolled();
  return (
    <nav
      data-scrolled={scrolled}
      className={[
        "sticky top-0 z-50 transition-[background-color,box-shadow] duration-300",
        scrolled
          ? "bg-cream/90 shadow-[0_2px_0_var(--color-ink)] backdrop-blur-sm"
          : "bg-transparent",
      ].join(" ")}
    >
      <div className="mx-auto flex max-w-[1040px] items-center justify-between px-6 py-5">
        <a href="#" className="flex items-center gap-2.5 text-[19px] font-extrabold">
          <BrandMark size={34} decorative />
          Beaver
        </a>
        <div className="flex flex-wrap items-center justify-end gap-3 text-[14px] font-semibold sm:gap-5 sm:text-[15px]">
          <a href="#how" className="hidden text-bark-soft hover:text-ink sm:block">
            How it works
          </a>
          <a
            href="#argument"
            className="hidden text-bark-soft hover:text-ink sm:block"
          >
            Why not a chatbot
          </a>
          <a href={GITHUB_URL} className="text-bark-soft hover:text-ink">
            GitHub
          </a>
          <a
            href={RELEASES_URL}
            className="btn-push bg-orange px-4 py-2 text-sm text-white sm:px-4.5 sm:py-2.5"
          >
            Download for Mac
          </a>
        </div>
      </div>
    </nav>
  );
}
