import { describe, it, expect } from "vitest";
import { selectView } from "../lib/routing";

describe("selectView", () => {
  it("renders the capture overlay on the capture route", () => {
    expect(selectView("/capture", "capture-overlay")).toBe("capture");
  });

  it("the capture route wins regardless of window label", () => {
    expect(selectView("/capture", "onboarding")).toBe("capture");
  });

  it("the onboarding window always shows onboarding", () => {
    expect(selectView("/", "onboarding")).toBe("onboarding");
  });

  it("the popover window shows the popover", () => {
    expect(selectView("/", "popover")).toBe("popover");
  });

  it("defaults unknown windows to the popover", () => {
    expect(selectView("/", "main")).toBe("popover");
  });
});
