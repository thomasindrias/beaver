import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "../components/Hero";
import { RELEASES_URL } from "../constants";
import { stubMatchMedia } from "./helpers";

describe("Hero", () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => vi.unstubAllGlobals());

  it("leads with the retyping headline", () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Stop retyping your screen.",
    );
  });

  it("promises clean Markdown on the clipboard without uploads", () => {
    render(<Hero />);
    expect(
      screen.getByText(/clean Markdown on your clipboard/),
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing uploaded/)).toBeInTheDocument();
  });

  it("links the primary CTA to the latest release", () => {
    render(<Hero />);
    expect(
      screen.getByRole("link", { name: "Download for Mac" }),
    ).toHaveAttribute("href", RELEASES_URL);
  });

  it("scrolls the secondary CTA to the how-it-works section", () => {
    render(<Hero />);
    expect(
      screen.getByRole("link", { name: "See how it works" }),
    ).toHaveAttribute("href", "#how");
  });

  it("states the platform qualifier", () => {
    render(<Hero />);
    expect(
      screen.getByText("Free and open source · macOS · Apple Silicon and Intel"),
    ).toBeInTheDocument();
  });

  it("greets with the waving mascot", () => {
    render(<Hero />);
    expect(screen.getByAltText("Beaver waving hello")).toHaveAttribute(
      "src",
      "/beaver-animations/beaver-wave.webp",
    );
  });
});
