import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IntroVideo } from "../components/IntroVideo";

describe("IntroVideo", () => {
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
  });

  it("plays the video on mount", () => {
    render(<IntroVideo isSettled={false} onSettle={vi.fn()} />);
    expect(playSpy).toHaveBeenCalled();
  });

  it("calls onSettle when the video ends", () => {
    const onSettle = vi.fn();
    render(<IntroVideo isSettled={false} onSettle={onSettle} />);
    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent.ended(video);
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it("calls onSettle when clicked (skip)", () => {
    const onSettle = vi.fn();
    render(<IntroVideo isSettled={false} onSettle={onSettle} />);
    fireEvent.click(screen.getByTestId("intro-video"));
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it("calls onSettle when autoplay is blocked", async () => {
    playSpy.mockRejectedValueOnce(new Error("NotAllowedError"));
    const onSettle = vi.fn();
    render(<IntroVideo isSettled={false} onSettle={onSettle} />);
    await waitFor(() => expect(onSettle).toHaveBeenCalledTimes(1));
  });

  it("pauses the video once settled", () => {
    const pauseSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});
    const { rerender } = render(
      <IntroVideo isSettled={false} onSettle={vi.fn()} />,
    );
    rerender(<IntroVideo isSettled={true} onSettle={vi.fn()} />);
    expect(pauseSpy).toHaveBeenCalled();
    pauseSpy.mockRestore();
  });
});
