import { describe, it, expect } from "vitest";
import { normalizeRect } from "../components/CaptureOverlay";

describe("normalizeRect", () => {
  it("top-left to bottom-right drag", () => {
    expect(normalizeRect({ x: 10, y: 10 }, { x: 200, y: 150 })).toEqual(
      { x: 10, y: 10, width: 190, height: 140 }
    );
  });

  it("bottom-right to top-left drag", () => {
    expect(normalizeRect({ x: 200, y: 150 }, { x: 10, y: 10 })).toEqual(
      { x: 10, y: 10, width: 190, height: 140 }
    );
  });

  it("zero-size selection", () => {
    expect(normalizeRect({ x: 50, y: 50 }, { x: 50, y: 50 })).toEqual(
      { x: 50, y: 50, width: 0, height: 0 }
    );
  });
});
