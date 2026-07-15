import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { normalizeRect, CaptureOverlay } from "../components/CaptureOverlay";

describe("normalizeRect", () => {
  it("top-left to bottom-right drag", () => {
    expect(normalizeRect({ x: 10, y: 10 }, { x: 200, y: 150 })).toEqual(
      { x: 10, y: 10, width: 190, height: 140 }
    );
  });

  it("bottom-right to top-left drag", () => {
    expect(normalizeRect({ x: 200, y: 150 }, { x: 10, y: 10 })).toEqual(
      { x: 10, y: 10, width: 190, height: 140 }
    );
  });

  it("zero-size selection", () => {
    expect(normalizeRect({ x: 50, y: 50 }, { x: 50, y: 50 })).toEqual(
      { x: 50, y: 50, width: 0, height: 0 }
    );
  });
});

describe("CaptureOverlay frozen mode", () => {
  const sel = { x: 10, y: 20, width: 100, height: 80 };

  it("renders only the selection ring when frozen", () => {
    render(<CaptureOverlay frozen={sel} onCapture={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId("frozen-selection")).toBeInTheDocument();
    expect(screen.queryByText(/Drag to capture/)).not.toBeInTheDocument();
  });

  it("frozen overlay ignores pointer events", () => {
    render(<CaptureOverlay frozen={sel} onCapture={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId("frozen-root").className).toContain("pointer-events-none");
  });

  it("does not listen for Escape while frozen", () => {
    const onCancel = vi.fn();
    render(<CaptureOverlay frozen={sel} onCapture={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
