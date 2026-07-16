import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  CaptureHud,
  LOADING_MESSAGES,
  MESSAGE_ROTATE_MS,
  FORMAT_COMMIT_MS,
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

  it("Escape cancels a pending debounced format commit", () => {
    vi.useFakeTimers();
    const onFormatChange = vi.fn();
    const onDismiss = vi.fn();
    render(
      <CaptureHud {...baseProps} onFormatChange={onFormatChange} onDismiss={onDismiss} />
    );
    fireEvent.keyDown(window, { key: "Tab" }); // reveal
    fireEvent.keyDown(window, { key: "Tab" }); // markdown -> csv (debounced)
    fireEvent.keyDown(window, { key: "Escape" }); // dismiss before commit fires
    act(() => vi.advanceTimersByTime(FORMAT_COMMIT_MS * 2));
    expect(onDismiss).toHaveBeenCalled();
    expect(onFormatChange).not.toHaveBeenCalled();
    vi.useRealTimers();
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

describe("CaptureHud keyboard lap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const tab = (shift = false) =>
    fireEvent.keyDown(window, { key: "Tab", shiftKey: shift });

  it("first Tab reveals the chips without changing format", () => {
    const onFormatChange = vi.fn();
    render(<CaptureHud {...baseProps} onFormatChange={onFormatChange} />);
    tab();
    expect(screen.getByRole("button", { name: "Markdown" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(FORMAT_COMMIT_MS));
    expect(onFormatChange).not.toHaveBeenCalled();
  });

  it("lapping with Tab debounces to a single commit of the final format", () => {
    const onFormatChange = vi.fn();
    render(<CaptureHud {...baseProps} onFormatChange={onFormatChange} />);
    tab(); // reveal
    tab(); // markdown -> csv
    tab(); // csv -> json
    expect(onFormatChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(FORMAT_COMMIT_MS));
    expect(onFormatChange).toHaveBeenCalledTimes(1);
    expect(onFormatChange).toHaveBeenCalledWith("json");
  });

  it("Tab past the last format opens the input; Tab again closes and wraps", () => {
    render(<CaptureHud {...baseProps} format="plain" />);
    tab(); // reveal (pending = plain)
    tab(); // plain -> input opens
    const input = screen.getByRole("textbox", { name: "Formatting hint" });
    expect(input).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(
      screen.queryByRole("textbox", { name: "Formatting hint" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute(
      "data-active",
      "true"
    );
  });

  it("digit keys commit immediately", () => {
    const onFormatChange = vi.fn();
    render(<CaptureHud {...baseProps} onFormatChange={onFormatChange} />);
    fireEvent.keyDown(window, { key: "2" });
    expect(onFormatChange).toHaveBeenCalledWith("csv");
  });

  it("slash opens the input and Enter submits the hint", () => {
    const onCustomSubmit = vi.fn();
    render(<CaptureHud {...baseProps} onCustomSubmit={onCustomSubmit} />);
    fireEvent.keyDown(window, { key: "/" });
    const input = screen.getByRole("textbox", { name: "Formatting hint" });
    fireEvent.change(input, { target: { value: "output Swedish" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCustomSubmit).toHaveBeenCalledWith("output Swedish");
  });

  it("Escape backs out one level: input, then dismissed", () => {
    const onDismiss = vi.fn();
    render(<CaptureHud {...baseProps} onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: "/" });
    const input = screen.getByRole("textbox", { name: "Formatting hint" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      screen.queryByRole("textbox", { name: "Formatting hint" })
    ).not.toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Enter in the error state triggers the action", () => {
    const onRetry = vi.fn();
    render(<CaptureHud {...baseProps} state="error" onRetry={onRetry} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onRetry).toHaveBeenCalled();
  });
});
