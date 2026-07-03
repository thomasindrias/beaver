import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

// Stub the model download so tests can drive the welcome -> download -> ready
// machine without the real polling loop. The stub exposes a button that fires
// onComplete, mimicking "download finished".
vi.mock("../components/ModelDownload", () => ({
  ModelDownload: ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>finish-download</button>
  ),
}));

vi.mock("../components/PermissionStep", () => ({
  PermissionStep: () => <div>allow screen access</div>,
}));

import { Onboarding, READY_DWELL_MS } from "../components/Onboarding";

// Advance the welcome -> download -> ready state machine.
async function reachReadyStep() {
  fireEvent.click(screen.getByRole("button", { name: /get started/i }));
  fireEvent.click(screen.getByRole("button", { name: /finish-download/i }));
  await act(async () => {}); // flush the permission check promise
}

describe("Onboarding", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset().mockImplementation(async (cmd: string) =>
      cmd === "screen_permission_granted" ? true : undefined
    );
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("headlines the welcome screen with the wave animation", () => {
    const { container } = render(<Onboarding />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("beaver-wave.webp");
  });

  it("exposes a drag region so the frameless window can be moved", () => {
    const { container } = render(<Onboarding />);
    expect(container.querySelector("[data-tauri-drag-region]")).not.toBeNull();
  });

  it("invokes finish_onboarding when the ready button is clicked", async () => {
    render(<Onboarding />);
    await reachReadyStep();

    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /start using beaver/i }));

    expect(invokeMock).toHaveBeenCalledWith("finish_onboarding");
  });

  it("auto-invokes finish_onboarding after the ready dwell", async () => {
    render(<Onboarding />);
    await reachReadyStep();
    expect(invokeMock).not.toHaveBeenCalledWith("finish_onboarding");

    act(() => {
      vi.advanceTimersByTime(READY_DWELL_MS);
    });

    expect(invokeMock).toHaveBeenCalledWith("finish_onboarding");
  });

  it("does not invoke finish_onboarding before reaching the ready step", () => {
    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    act(() => {
      vi.advanceTimersByTime(READY_DWELL_MS);
    });

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("detours to the permission step when access is missing", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "screen_permission_granted" ? false : undefined
    );
    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish-download/i }));
    await act(async () => {});

    expect(screen.getByText(/allow screen access/i)).toBeInTheDocument();
  });
});
