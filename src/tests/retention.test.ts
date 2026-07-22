import { describe, it, expect } from "vitest";
import { retentionCutoff } from "../lib/retention";

describe("retentionCutoff", () => {
  it("subtracts the given number of days from now", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    expect(retentionCutoff(30, now)).toBe("2026-06-22T12:00:00.000Z");
  });

  it("handles a single day", () => {
    const now = new Date("2026-07-22T00:00:00.000Z");
    expect(retentionCutoff(1, now)).toBe("2026-07-21T00:00:00.000Z");
  });

  it("defaults to the current time when now is omitted", () => {
    const before = Date.now();
    const cutoff = new Date(retentionCutoff(0)).getTime();
    const after = Date.now();
    expect(cutoff).toBeGreaterThanOrEqual(before);
    expect(cutoff).toBeLessThanOrEqual(after);
  });
});
