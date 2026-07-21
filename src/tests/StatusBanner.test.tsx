import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

type FocusHandler = (event: { payload: boolean }) => void;

const { invokeMock, focusHandlers } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  focusHandlers: [] as FocusHandler[],
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: (handler: FocusHandler) => {
      focusHandlers.push(handler);
      return Promise.resolve(() => {
        const i = focusHandlers.indexOf(handler);
        if (i >= 0) focusHandlers.splice(i, 1);
      });
    },
  }),
}));

function emitFocus(focused: boolean) {
  focusHandlers.forEach(h => h({ payload: focused }));
}

import { StatusBanner } from "../components/StatusBanner";

function mockBackend(opts: { granted: boolean; phase: string; detail?: string | null }) {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "screen_permission_granted") return opts.granted;
    if (cmd === "engine_status")
      return { phase: opts.phase, progress: null, detail: opts.detail ?? null };
    return undefined;
  });
}

describe("StatusBanner", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    focusHandlers.length = 0;
  });

  it("renders nothing when ready and permitted", async () => {
    mockBackend({ granted: true, phase: "ready" });
    const { container } = render(<StatusBanner />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("engine_status"));
    expect(container).toBeEmptyDOMElement();
  });

  it("warns when screen permission is missing and opens settings", async () => {
    mockBackend({ granted: false, phase: "ready" });
    render(<StatusBanner />);
    expect(await screen.findByText(/screen recording is off/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open settings/i }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_screen_recording_settings")
    );
  });

  it("shows the failure reason with a retry action", async () => {
    mockBackend({ granted: true, phase: "error", detail: "Lost contact with the on-device model server." });
    render(<StatusBanner />);
    expect(await screen.findByText(/lost contact/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("retry_setup"));
  });

  it("prioritizes the permission banner over a setup error", async () => {
    mockBackend({ granted: false, phase: "error", detail: "Setup failed." });
    render(<StatusBanner />);

    expect(await screen.findByText(/screen recording is off/i)).toBeInTheDocument();
    expect(screen.queryByText(/setup failed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  // The popover window lives for the app's whole lifetime; once everything
  // goes healthy the poll loop stops (by design, see above). Without a
  // focus-triggered restart, a permission revoked or model crash days later
  // would never be surfaced again.
  it("resumes polling on focus after having gone quiet, and surfaces a state that broke in the meantime", async () => {
    mockBackend({ granted: true, phase: "ready" });
    render(<StatusBanner />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("engine_status"));

    const callsAfterQuiet = invokeMock.mock.calls.length;
    // Give the (now-stopped) loop a chance to wrongly reschedule itself.
    await new Promise(r => setTimeout(r, 10));
    expect(invokeMock.mock.calls.length).toBe(callsAfterQuiet);

    // Something broke while the popover was hidden and quiet.
    mockBackend({ granted: false, phase: "ready" });

    emitFocus(true);

    expect(
      await screen.findByText(/screen recording is off/i)
    ).toBeInTheDocument();
  });

  it("does not restart the poll loop on blur", async () => {
    mockBackend({ granted: true, phase: "ready" });
    render(<StatusBanner />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("engine_status"));
    invokeMock.mockClear();

    emitFocus(false);
    await new Promise(r => setTimeout(r, 10));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("stops listening for focus changes after unmount", async () => {
    mockBackend({ granted: true, phase: "ready" });
    const { unmount } = render(<StatusBanner />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("engine_status"));
    expect(focusHandlers).toHaveLength(1);

    unmount();
    await waitFor(() => expect(focusHandlers).toHaveLength(0));
  });
});
