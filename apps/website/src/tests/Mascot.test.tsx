import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Mascot } from "../components/Mascot";
import { stubMatchMedia } from "./helpers";

describe("Mascot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the animated mood when motion is allowed", () => {
    stubMatchMedia(false);
    render(<Mascot mood="angry" alt="Beaver unimpressed" />);
    expect(screen.getByAltText("Beaver unimpressed")).toHaveAttribute(
      "src",
      "/beaver-animations/beaver-angry.webp",
    );
  });

  it("falls back to the static head when the visitor prefers reduced motion", () => {
    stubMatchMedia(true);
    render(<Mascot mood="angry" alt="Beaver unimpressed" />);
    expect(screen.getByAltText("Beaver unimpressed")).toHaveAttribute(
      "src",
      "/beaver-head.webp",
    );
  });

  it("lazy-loads by default so below-the-fold mascots don't block the page", () => {
    stubMatchMedia(false);
    render(<Mascot mood="happy" alt="Happy beaver" />);
    expect(screen.getByAltText("Happy beaver")).toHaveAttribute(
      "loading",
      "lazy",
    );
  });

  it("loads eagerly when asked, for the hero", () => {
    stubMatchMedia(false);
    render(<Mascot mood="wave" alt="Beaver waving hello" eager />);
    expect(screen.getByAltText("Beaver waving hello")).toHaveAttribute(
      "loading",
      "eager",
    );
  });
});
