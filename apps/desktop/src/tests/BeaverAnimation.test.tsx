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

  it("sizes by height and lets width follow each animation's own aspect", () => {
    const { container } = render(<BeaverAnimation mood="singing" size={128} />);
    const img = container.querySelector("img")!;
    expect(img.style.height).toBe("128px");
    expect(img.style.width).toBe("auto");
  });
});
