import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

function sameBytes(left: string, right: string) {
  expect(readFileSync(left), `${left} should match ${right}`).toEqual(
    readFileSync(right),
  );
}

describe("brand asset sync", () => {
  it("keeps desktop public copies in sync with canonical brand assets", () => {
    sameBytes(
      "packages/brand/assets/beaver-head.webp",
      "apps/desktop/public/beaver-head.webp",
    );
    sameBytes(
      "packages/brand/assets/favicon.ico",
      "apps/desktop/public/favicon.ico",
    );
  });

  it("removes starter template assets from the desktop app", () => {
    expect(existsSync("apps/desktop/public/vite.svg")).toBe(false);
    expect(existsSync("apps/desktop/public/tauri.svg")).toBe(false);
    expect(existsSync("apps/desktop/src/assets/react.svg")).toBe(false);
  });
});
