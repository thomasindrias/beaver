import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { Logo } from "../components/Logo";

describe("Logo", () => {
  it("renders the beaver-head image as the mark", () => {
    const { container } = render(<Logo />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("beaver-head");
  });

  it("sizes the mark to the given size", () => {
    const { container } = render(<Logo size={22} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("width")).toBe("22");
    expect(img?.getAttribute("height")).toBe("22");
  });

  it("pulses when live", () => {
    const { container } = render(<Logo live />);
    expect(container.querySelector("img")?.className).toContain(
      "animate-beaver-pulse",
    );
  });

  it("does not pulse when not live", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("img")?.className ?? "").not.toContain(
      "animate-beaver-pulse",
    );
  });
});
