import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BrandMark } from ".";

describe("BrandMark", () => {
  it("renders the shared beaver mark", () => {
    render(<BrandMark alt="Beaver logo" />);
    expect(screen.getByAltText("Beaver logo").getAttribute("src")).toBe(
      "/beaver-head.webp",
    );
  });

  it("can render decoratively", () => {
    const { container } = render(<BrandMark decorative />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("aria-hidden")).toBe("true");
  });
});
