import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Nav } from "../components/Nav";

function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
}

describe("Nav", () => {
  afterEach(() => setScrollY(0));

  it("starts without the scrolled shadow at the top of the page", () => {
    setScrollY(0);
    render(<Nav />);
    expect(screen.getByRole("navigation")).toHaveAttribute(
      "data-scrolled",
      "false",
    );
  });

  it("picks up the scrolled shadow once the page scrolls down", () => {
    setScrollY(0);
    render(<Nav />);
    setScrollY(40);
    fireEvent.scroll(window);
    expect(screen.getByRole("navigation")).toHaveAttribute(
      "data-scrolled",
      "true",
    );
  });
});
