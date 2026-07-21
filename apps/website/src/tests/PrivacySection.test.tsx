import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrivacySection } from "../components/PrivacySection";
import { stubMatchMedia } from "./helpers";

describe("PrivacySection", () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => vi.unstubAllGlobals());

  it("headlines that data stays home", () => {
    render(<PrivacySection />);
    expect(
      screen.getByRole("heading", { name: "Your data sleeps at home." }),
    ).toBeInTheDocument();
  });

  it("names both on-device engines", () => {
    render(<PrivacySection />);
    expect(
      screen.getByText(/MLX on Apple Silicon, llama\.cpp on Intel/),
    ).toBeInTheDocument();
  });

  it("documents the update-check kill switch", () => {
    render(<PrivacySection />);
    expect(
      screen.getByText("BEAVER_DISABLE_UPDATE_CHECK=1"),
    ).toBeInTheDocument();
  });
});
