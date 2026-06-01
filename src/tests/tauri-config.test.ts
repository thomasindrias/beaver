import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));

describe("tauri bundle config", () => {
  it("targets only app and dmg", () => {
    expect(conf.bundle.targets).toEqual(["app", "dmg"]);
  });

  it("sets a macOS minimum system version", () => {
    expect(conf.bundle.macOS.minimumSystemVersion).toBe("13.0");
  });

  it("configures the dmg window and icon positions", () => {
    const dmg = conf.bundle.macOS.dmg;
    expect(dmg.background).toBe("dmg/background.png");
    expect(dmg.windowSize).toEqual({ width: 660, height: 420 });
    expect(dmg.appPosition).toEqual({ x: 180, y: 210 });
    expect(dmg.applicationFolderPosition).toEqual({ x: 480, y: 210 });
  });
});
