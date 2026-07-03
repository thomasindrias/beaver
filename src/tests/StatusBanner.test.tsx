import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { StatusBanner } from "../components/StatusBanner";

function mockBackend(opts: { granted: boolean; phase: string; detail?: string | null }) {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "screen_permission_granted") return opts.granted;
    if (cmd === "mlx_status")
      return { phase: opts.phase, progress: null, detail: opts.detail ?? null };
    return undefined;
  });
}

describe("StatusBanner", () => {
  beforeEach(() => invokeMock.mockReset());

  it("renders nothing when ready and permitted", async () => {
    mockBackend({ granted: true, phase: "ready" });
    const { container } = render(<StatusBanner />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("mlx_status"));
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
});
