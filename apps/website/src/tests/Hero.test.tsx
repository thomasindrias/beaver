import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Hero } from "../components/Hero";
import { heroCopy } from "../constants";

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe("Hero", () => {
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("starts in the intro phase and does not show the headline yet", () => {
    stubMatchMedia(false);
    render(<Hero />);
    expect(screen.queryByText(heroCopy.headline)).not.toBeInTheDocument();
  });

  it("settles and shows the headline once the intro video ends", () => {
    stubMatchMedia(false);
    render(<Hero />);
    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent.ended(video);
    expect(screen.getByText(heroCopy.headline)).toBeInTheDocument();
  });

  it("settles immediately when the visitor prefers reduced motion, without autoplaying", () => {
    stubMatchMedia(true);
    render(<Hero />);
    expect(screen.getByText(heroCopy.headline)).toBeInTheDocument();
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).not.toHaveAttribute("autoplay");
  });

  it("settles when autoplay is blocked", async () => {
    stubMatchMedia(false);
    playSpy.mockRejectedValueOnce(new Error("NotAllowedError"));
    render(<Hero />);
    await waitFor(() =>
      expect(screen.getByText(heroCopy.headline)).toBeInTheDocument(),
    );
  });

  it("settles when the intro is clicked (skip)", () => {
    stubMatchMedia(false);
    render(<Hero />);
    fireEvent.click(screen.getByTestId("intro-video"));
    expect(screen.getByText(heroCopy.headline)).toBeInTheDocument();
  });

  it("plays the intro only once per browser session", () => {
    stubMatchMedia(false);
    const { unmount } = render(<Hero />);
    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent.ended(video);

    expect(window.sessionStorage.getItem("beaver:intro-seen")).toBe("true");

    unmount();
    render(<Hero />);

    expect(screen.getByText(heroCopy.headline)).toBeInTheDocument();
    expect(screen.queryByTestId("intro-video")).not.toBeInTheDocument();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
