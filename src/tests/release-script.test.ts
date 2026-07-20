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

describe("updater artifacts", () => {
  const sh = readFileSync("scripts/release-macos.sh", "utf8");

  it("gates updater artifacts on the signing key, not on Apple identity", () => {
    expect(sh).toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(sh).toContain("tauri signer sign");
  });

  it("tars the app only after Apple signing and stapling", () => {
    const stapleApp = sh.indexOf('stapler staple "$APP"');
    const tarball = sh.indexOf(".app.tar.gz");
    expect(stapleApp).toBeGreaterThan(-1);
    expect(tarball).toBeGreaterThan(stapleApp);
  });

  it("emits a per-architecture latest-fragment.json, not a full manifest", () => {
    expect(sh).toContain("latest-fragment.json");
    expect(sh).toContain('"darwin-${ARCH}"');
    expect(sh).not.toContain("latest.json");
  });

  it("accepts the target architecture as an optional first argument, defaulting to aarch64-apple-darwin", () => {
    expect(sh).toContain('TARGET="${1:-aarch64-apple-darwin}"');
    expect(sh).toContain('ARCH="${TARGET%%-*}"');
  });

  it("names the DMG and updater tarball after the resolved architecture, not hardcoded to aarch64", () => {
    expect(sh).toContain("Beaver_${VERSION}_${ARCH}.dmg");
    expect(sh).toContain("Beaver_${VERSION}_${ARCH}.app.tar.gz");
    expect(sh).not.toContain("Beaver_${VERSION}_aarch64.app.tar.gz");
  });

  it("documents the updater key in .env.release.example", () => {
    const ex = readFileSync(".env.release.example", "utf8");
    expect(ex).toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(ex).toContain("TAURI_SIGNING_PRIVATE_KEY_PASSWORD");
  });
});
