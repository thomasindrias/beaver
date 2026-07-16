import { describe, it, expect } from "vitest";
import { hudPosition, HUD_GAP, HUD_HEIGHT, HUD_MARGIN, HUD_MAX_WIDTH } from "../lib/hudPosition";

const viewport = { width: 1440, height: 900 };

describe("hudPosition", () => {
  it("sits below the selection's bottom-left corner", () => {
    const sel = { x: 100, y: 100, width: 300, height: 200 };
    expect(hudPosition(sel, viewport)).toEqual({ x: 100, y: 300 + HUD_GAP, above: false });
  });

  it("flips above the selection near the bottom edge", () => {
    const sel = { x: 100, y: 700, width: 300, height: 900 - 700 - HUD_GAP };
    const pos = hudPosition(sel, viewport);
    expect(pos.above).toBe(true);
    expect(pos.y).toBe(700 - HUD_GAP - HUD_HEIGHT);
  });

  it("clamps to the left margin", () => {
    const sel = { x: 2, y: 100, width: 50, height: 50 };
    expect(hudPosition(sel, viewport).x).toBe(HUD_MARGIN);
  });

  it("clamps so an expanded pill never clips the right edge", () => {
    const sel = { x: 1400, y: 100, width: 30, height: 50 };
    expect(hudPosition(sel, viewport).x).toBe(1440 - HUD_MARGIN - HUD_MAX_WIDTH);
  });
});
