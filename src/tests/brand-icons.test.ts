import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const BRAND_MARK = "public/beaver-head.webp";

describe("brand icon source", () => {
  it("ships the canonical beaver head asset used by the UI logo", () => {
    expect(existsSync(BRAND_MARK)).toBe(true);
    expect(readFileSync("src/components/Logo.tsx", "utf8")).toContain(
      "/beaver-head.webp",
    );
  });

  it("uses the canonical beaver head for browser metadata", () => {
    const html = readFileSync("index.html", "utf8");

    expect(html).toContain('href="/beaver-head.webp"');
    expect(html).toContain("<title>Beaver</title>");
    expect(html).not.toContain("/vite.svg");
  });

  it("derives native app icons from the canonical beaver head", () => {
    const generator = readFileSync("scripts/gen-app-icon.py", "utf8");

    expect(generator).toContain('"public" / "beaver-head.webp"');
    expect(generator).not.toContain("Downloads");
  });
});
