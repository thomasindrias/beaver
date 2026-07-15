import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const {
  invokeMock,
  windowLabel,
  beaverState,
  runCaptureMock,
  closeMock,
  ignoreCursorMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  windowLabel: { value: "popover" },
  beaverState: { value: "idle" as string },
  runCaptureMock: vi.fn(),
  closeMock: vi.fn().mockResolvedValue(undefined),
  ignoreCursorMock: vi.fn().mockResolvedValue(undefined),
}));

const { dismissMock } = vi.hoisted(() => ({ dismissMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: windowLabel.value,
    close: closeMock,
    hide: vi.fn().mockResolvedValue(undefined),
    setIgnoreCursorEvents: ignoreCursorMock,
  }),
}));
vi.mock("../hooks/useBeaver", () => ({
  useBeaver: () => ({
    state: beaverState.value,
    errorKind: "generic",
    format: "markdown",
    contentType: "prose",
    runCapture: runCaptureMock,
    reExtract: vi.fn(),
    retry: vi.fn(),
    engage: vi.fn(),
    dismiss: dismissMock,
  }),
}));
vi.mock("../components/CaptureOverlay", () => ({
  CaptureOverlay: ({
    onCapture,
    frozen,
  }: {
    onCapture: (r: unknown, p: unknown) => void;
    frozen?: unknown;
  }) =>
    frozen ? (
      <div>frozen-overlay</div>
    ) : (
      <button
        onClick={() =>
          onCapture({ x: 1, y: 1, width: 20, height: 20 }, { x: 7, y: 9 })
        }
      >
        do-capture
      </button>
    ),
}));
vi.mock("../components/CaptureHud", () => ({
  CaptureHud: ({ state }: { state: string }) => <div>capture-hud:{state}</div>,
}));
vi.mock("../components/TrayPopover", () => ({
  TrayPopover: () => <div>tray-popover</div>,
}));
vi.mock("../components/Onboarding", () => ({
  Onboarding: () => <div>onboarding-view</div>,
}));

import App from "../App";

describe("App window routing", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue(undefined);
  });

  it("renders onboarding in the onboarding window", async () => {
    windowLabel.value = "onboarding";
    render(<App />);
    expect(await screen.findByText("onboarding-view")).toBeInTheDocument();
    expect(screen.queryByText("tray-popover")).not.toBeInTheDocument();
  });

  it("renders the popover in the popover window", async () => {
    windowLabel.value = "popover";
    render(<App />);
    expect(await screen.findByText("tray-popover")).toBeInTheDocument();
    expect(screen.queryByText("onboarding-view")).not.toBeInTheDocument();
  });

  // The original bug: the onboarding window briefly asked the backend
  // "is this the first launch?" and rendered the popover when setup had already
  // completed (warm-cache race). Routing must depend only on the window label.
  it("never queries first-launch state to decide what to render", async () => {
    windowLabel.value = "onboarding";
    render(<App />);
    await screen.findByText("onboarding-view");
    expect(invokeMock).not.toHaveBeenCalledWith("is_first_launch");
  });
});

describe("App capture flow", () => {
  beforeEach(() => {
    windowLabel.value = "capture-overlay";
    beaverState.value = "idle";
    runCaptureMock.mockReset();
    dismissMock.mockReset();
    ignoreCursorMock.mockClear();
    window.history.pushState({}, "", "/capture");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("shows the capture overlay before a selection is made", () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: /do-capture/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/capture-hud/i)).not.toBeInTheDocument();
  });

  it("freezes the selection and mounts the HUD after a capture", () => {
    beaverState.value = "processing";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));
    expect(runCaptureMock).toHaveBeenCalledWith({
      x: 1,
      y: 1,
      width: 20,
      height: 20,
    });
    expect(screen.getByText("frozen-overlay")).toBeInTheDocument();
    expect(screen.getByText("capture-hud:processing")).toBeInTheDocument();
  });

  it("goes click-through while processing", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));
    expect(ignoreCursorMock).toHaveBeenCalledWith(true);
  });

  it("becomes interactive again when the result arrives", () => {
    beaverState.value = "success";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));
    expect(ignoreCursorMock).toHaveBeenCalledWith(false);
  });

  it("clicking outside the HUD dismisses", () => {
    beaverState.value = "success";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));
    fireEvent.mouseDown(screen.getByTestId("click-away"));
    expect(dismissMock).toHaveBeenCalled();
  });

  it("re-enters click-through when retry returns to processing", () => {
    beaverState.value = "success";
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));
    expect(ignoreCursorMock).toHaveBeenCalledWith(false);

    ignoreCursorMock.mockClear();
    beaverState.value = "processing";
    rerender(<App />);
    expect(ignoreCursorMock).toHaveBeenCalledWith(true);
  });
});
