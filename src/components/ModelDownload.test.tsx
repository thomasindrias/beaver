import { describe, it, expect } from "vitest";
import { formatPhase } from "./ModelDownload";

describe("formatPhase", () => {
  it("maps known phases to human labels", () => {
    expect(formatPhase("preparing")).toBe("Preparing environment…");
    expect(formatPhase("starting")).toBe("Starting…");
    expect(formatPhase("downloading")).toBe("Downloading model…");
    expect(formatPhase("loading")).toBe("Loading model…");
    expect(formatPhase("ready")).toBe("Ready");
  });

  it("falls back to a generic label for unknown values", () => {
    expect(formatPhase("something-else")).toBe("Setting up…");
  });
});
