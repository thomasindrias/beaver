import { describe, expect, it } from "vitest";
import { clamp01, mix, progress } from "./ease";
import { easeInOutCubic, easeOutCubic, easeOutExpo, easeOutBack } from "./ease";
import { mulberry32 } from "./rng";
import { beatLen, barStart, onBeat } from "./grid";
import { charsAt } from "./typeon";

describe("progress", () => {
  it("is 0 before the window and 1 after it", () => {
    expect(progress(10, 20, 40)).toBe(0);
    expect(progress(50, 20, 40)).toBe(1);
  });
  it("is linear inside the window", () => {
    expect(progress(30, 20, 40)).toBeCloseTo(0.5);
  });
  it("clamps a zero-length window instead of dividing by zero", () => {
    expect(progress(20, 20, 20)).toBe(1);
    expect(progress(19, 20, 20)).toBe(0);
  });
});

describe("mix/clamp01", () => {
  it("mixes linearly", () => {
    expect(mix(10, 20, 0.5)).toBe(15);
  });
  it("clamps to [0,1]", () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });
});

describe("eases", () => {
  it("all pin 0->0 and 1->1", () => {
    for (const e of [easeInOutCubic, easeOutCubic, easeOutExpo, easeOutBack]) {
      expect(e(0)).toBeCloseTo(0, 5);
      expect(e(1)).toBeCloseTo(1, 5);
    }
  });
  it("easeOutBack overshoots past 1 mid-curve", () => {
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => easeOutBack((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1);
  });
});

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("yields values in [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("tempo grid (90bpm @ 30fps)", () => {
  it("one beat is 20 frames", () => {
    expect(beatLen(90, 30)).toBe(20);
  });
  it("bar n starts at n*80 frames", () => {
    expect(barStart(0, 90, 30)).toBe(0);
    expect(barStart(3, 90, 30)).toBe(240);
  });
  it("onBeat flags exact beat frames only", () => {
    expect(onBeat(40, 90, 30)).toBe(true);
    expect(onBeat(41, 90, 30)).toBe(false);
  });
});

describe("charsAt", () => {
  it("shows nothing before start and everything when done", () => {
    expect(charsAt(0, 10, 30, 30, 12)).toBe(0);
    expect(charsAt(500, 10, 30, 30, 12)).toBe(12);
  });
  it("advances at cps characters per second", () => {
    // 15 cps at 30fps = 1 char per 2 frames; 8 frames after start -> 4 chars.
    expect(charsAt(18, 10, 15, 30, 100)).toBe(4);
  });
});
