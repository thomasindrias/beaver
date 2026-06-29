import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("workspace layout", () => {
  it("has both a desktop app and a website app", () => {
    expect(existsSync("apps/desktop/package.json")).toBe(true);
    expect(existsSync("apps/website/package.json")).toBe(true);
  });

  it("keeps root dev on the apps/* pattern", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts.dev).toContain("turbo run dev");
    expect(pkg.scripts.dev).toContain("./apps/*");
  });

  it("keeps native Tauri dev explicit", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts.tauri).toContain("@beaver/desktop");
    expect(pkg.scripts["tauri:onboarding"]).toContain("BEAVER_FORCE_ONBOARDING=1");
  });

  it("registers only apps and packages as workspaces", () => {
    const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
    expect(workspace).toContain("apps/*");
    expect(workspace).toContain("packages/*");
  });
});
