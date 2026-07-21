import { GITHUB_URL, ROADMAP_URL, SECURITY_URL } from "../constants";

export function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1040px] flex-wrap justify-between gap-3 border-t-[2.5px] border-dashed border-ink px-6 pt-6 pb-11 text-[13.5px] font-semibold text-muted">
      <span>© 2026 Beaver · MIT license</span>
      <span>
        <a href={GITHUB_URL} className="hover:text-ink">
          GitHub
        </a>{" "}
        ·{" "}
        <a href={SECURITY_URL} className="hover:text-ink">
          Security
        </a>{" "}
        ·{" "}
        <a href={ROADMAP_URL} className="hover:text-ink">
          Roadmap
        </a>
      </span>
    </footer>
  );
}
