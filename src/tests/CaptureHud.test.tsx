import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  CaptureHud,
  LOADING_MESSAGES,
  MESSAGE_ROTATE_MS,
} from "../components/CaptureHud";

const noop = () => {};
const baseProps = {
  state: "success" as const,
  errorKind: "generic" as const,
  contentType: "table" as const,
  format: "markdown" as const,
  anchor: { x: 20, y: 200 },
  onFormatChange: noop,
  onCustomSubmit: noop,
  onRetry: noop,
  onOpenSettings: noop,
  onEngage: noop,
  onDismiss: noop,
};

describe("CaptureHud rendering", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a rotating loading line while processing", () => {
    vi.useFakeTimers();
    render(<CaptureHud {...baseProps} state="processing" />);
    const first = screen.getByTestId("hud-message").textContent!;
    expect(LOADING_MESSAGES).toContain(first);
    act(() => {
      vi.advanceTimersByTime(MESSAGE_ROTATE_MS);
    });
    expect(screen.getByTestId("hud-message").textContent).not.toBe(first);
  });

  it("shows the copied pill with the detected content type", () => {
    render(<CaptureHud {...baseProps} />);
    expect(screen.getByText("Copied as table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Markdown" })).not.toBeInTheDocument();
  });

  it("reveals the chip row on hover and engages", () => {
    const onEngage = vi.fn();
    render(<CaptureHud {...baseProps} onEngage={onEngage} />);
    fireEvent.mouseEnter(screen.getByTestId("hud"));
    expect(onEngage).toHaveBeenCalled();
    for (const name of ["Markdown", "Table / CSV", "JSON", "Plain text", "Custom hint"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("clicking a chip commits the format immediately", () => {
    const onFormatChange = vi.fn();
    render(<CaptureHud {...baseProps} onFormatChange={onFormatChange} />);
    fireEvent.mouseEnter(screen.getByTestId("hud"));
    fireEvent.click(screen.getByRole("button", { name: "Table / CSV" }));
    expect(onFormatChange).toHaveBeenCalledWith("csv");
  });

  it("marks the committed chip as active while rerendering", () => {
    render(<CaptureHud {...baseProps} state="rerendering" format="csv" />);
    expect(screen.getByRole("button", { name: "Table / CSV" })).toHaveAttribute(
      "data-active",
      "true"
    );
  });

  it("generic errors offer a retry action", () => {
    const onRetry = vi.fn();
    render(<CaptureHud {...baseProps} state="error" onRetry={onRetry} />);
    expect(screen.getByText("Dam — couldn't read that")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("permission errors offer to open System Settings", () => {
    const onOpenSettings = vi.fn();
    render(
      <CaptureHud
        {...baseProps}
        state="error"
        errorKind="permission"
        onOpenSettings={onOpenSettings}
      />
    );
    expect(screen.getByText("Needs Screen Recording access")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open System Settings" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
