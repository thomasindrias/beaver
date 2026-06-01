import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

function pngSize(path: string) {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe("dmg background", () => {
  it("ships a 1x background at 660x420", () => {
    expect(pngSize("src-tauri/dmg/background.png")).toEqual({ width: 660, height: 420 });
  });

  it("ships a retina background at 1320x840", () => {
    expect(pngSize("src-tauri/dmg/background@2x.png")).toEqual({ width: 1320, height: 840 });
  });
});
