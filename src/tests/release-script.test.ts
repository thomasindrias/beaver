import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function printMode(identity: string): string {
  return execFileSync("bash", ["scripts/release-macos.sh", "--print-mode"], {
    encoding: "utf8",
    env: {
      ...process.env,
      APPLE_SIGNING_IDENTITY: identity,
      BEAVER_SKIP_RELEASE_ENV: "1",
    },
  }).trim();
}

describe("release-macos.sh", () => {
  it("reports unsigned without a signing identity", () => {
    expect(printMode("")).toBe("unsigned");
  });

  it("reports signed when a signing identity is set", () => {
    expect(printMode("Developer ID Application: Example Developer (TEAMID1234)")).toBe("signed");
  });
});

describe("release wiring", () => {
  it("documents credentials in .env.release.example", () => {
    const ex = readFileSync(".env.release.example", "utf8");
    expect(ex).toContain("APPLE_SIGNING_IDENTITY");
    expect(ex).toContain("APPLE_TEAM_ID");
  });

  it("gitignores the real .env.release", () => {
    expect(readFileSync(".gitignore", "utf8")).toContain(".env.release");
  });

  it("exposes a release:mac script", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["release:mac"]).toContain("release-macos.sh");
  });

  it("keeps the example file", () => {
    expect(existsSync(".env.release.example")).toBe(true);
  });
});

describe("headless dmg packaging", () => {
  it("packages the DMG with dmgbuild (no Finder/AppleScript)", () => {
    const sh = readFileSync("scripts/release-macos.sh", "utf8");
    expect(sh).toContain("dmgbuild");
    expect(sh).toContain("scripts/dmgbuild-settings.py");
  });

  it("ships a dmgbuild settings file with the install layout", () => {
    const s = readFileSync("scripts/dmgbuild-settings.py", "utf8");
    expect(s).toContain("symlinks");
    expect(s).toContain("Applications");
    expect(s).toContain("icon_locations");
    expect(s).toContain("BEAVER_APP");
  });
});
