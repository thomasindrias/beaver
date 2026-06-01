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
  useBeaver: () => ({ state: beaverState.value, runCapture: runCaptureMock }),
}));
vi.mock("../components/CaptureOverlay", () => ({
  CaptureOverlay: ({
    onCapture,
  }: {
    onCapture: (r: unknown, p: unknown) => void;
  }) => (
    <button
      onClick={() =>
        onCapture({ x: 1, y: 1, width: 20, height: 20 }, { x: 7, y: 9 })
      }
    >
      do-capture
    </button>
  ),
}));
vi.mock("../components/CursorToast", () => ({
  CursorToast: ({ state }: { state: string }) => <div>cursor-toast:{state}</div>,
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
    expect(screen.queryByText(/cursor-toast/i)).not.toBeInTheDocument();
  });

  it("swaps to the cursor toast after a selection and runs the capture", () => {
    beaverState.value = "processing";
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));

    expect(runCaptureMock).toHaveBeenCalledWith({
      x: 1,
      y: 1,
      width: 20,
      height: 20,
    });
    expect(screen.getByText("cursor-toast:processing")).toBeInTheDocument();
  });

  // The overlay is fullscreen + always-on-top; if it kept capturing the mouse
  // during processing it would swallow every click on screen (feels like a
  // freeze). Going click-through lets clicks pass through to the apps beneath.
  it("makes the overlay click-through once a selection is made", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));
    expect(ignoreCursorMock).toHaveBeenCalledWith(true);
  });
});
