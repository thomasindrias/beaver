import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const caps = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));

describe("tauri bundle config", () => {
  it("builds only the .app (DMG is packaged headlessly by dmgbuild)", () => {
    expect(conf.bundle.targets).toEqual(["app"]);
  });

  it("sets a macOS minimum system version", () => {
    expect(conf.bundle.macOS.minimumSystemVersion).toBe("13.0");
  });

  it("does not use Tauri's Finder-scripted dmg bundler", () => {
    expect(conf.bundle.macOS.dmg).toBeUndefined();
  });

  it("bundles the pinned Python lockfile", () => {
    expect(conf.bundle.resources).toContain("resources/requirements.lock");
  });

  it("sets a strict CSP", () => {
    const csp = conf.app.security.csp;
    expect(csp).toBe(
      "default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src ipc: http://ipc.localhost"
    );
  });
});

describe("updater config", () => {
  it("pins the single GitHub latest.json endpoint", () => {
    expect(conf.plugins.updater.endpoints).toEqual([
      "https://github.com/thomasindrias/beaver/releases/latest/download/latest.json",
    ]);
  });

  it("embeds a non-empty updater public key", () => {
    expect(typeof conf.plugins.updater.pubkey).toBe("string");
    expect(conf.plugins.updater.pubkey.length).toBeGreaterThan(0);
  });

  it("grants exactly the updater and restart permissions", () => {
    expect(caps.permissions).toContain("updater:default");
    expect(caps.permissions).toContain("process:allow-restart");
    expect(caps.permissions).not.toContain("process:default");
  });
});
