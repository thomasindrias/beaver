import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BeaverAnimation } from "../components/BeaverAnimation";

describe("BeaverAnimation", () => {
  it("renders the looping webp for the given mood", () => {
    const { container } = render(<BeaverAnimation mood="wave" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toContain(
      "/beaver-animations/beaver-wave.webp",
    );
  });

  it("sizes from the portrait aspect ratio", () => {
    const { container } = render(<BeaverAnimation mood="singing" size={323} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("height")).toBe("323");
    expect(img.getAttribute("width")).toBe("299");
  });
});
