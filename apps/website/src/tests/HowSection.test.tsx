import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import { HowSection } from "../components/HowSection";
import { stubMatchMedia } from "./helpers";

describe("HowSection", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("anchors at #how so the hero CTA can reach it", () => {
    render(<HowSection />);
    expect(document.getElementById("how")).not.toBeNull();
  });

  it("walks through the three steps in order", () => {
    render(<HowSection />);
    const steps = screen.getAllByTestId("step");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent(/Press/);
    expect(steps[1]).toHaveTextContent("Box the thing you need");
    expect(steps[2]).toHaveTextContent("Paste it anywhere");
  });

  it("says the model runs on-device", () => {
    render(<HowSection />);
    expect(
      screen.getByText(/The vision model lives on your Mac/),
    ).toBeInTheDocument();
  });

  it("shows the before and after exhibit with real Markdown output once captured", () => {
    render(<HowSection />);
    expect(screen.getByText("on your screen")).toBeInTheDocument();
    act(() => {
      vi.runAllTimers();
    });
    const clipboard = screen.getByTestId("exhibit-markdown");
    expect(within(clipboard).getByText(/\| Plan/)).toBeInTheDocument();
  });
});
