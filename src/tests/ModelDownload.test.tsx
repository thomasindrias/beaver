import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { ModelDownload } from "../components/ModelDownload";

describe("ModelDownload progress", () => {
  beforeEach(() => invokeMock.mockReset());

  it("renders a determinate progress bar at the reported percentage", async () => {
    invokeMock.mockResolvedValue({ phase: "downloading", progress: 0.42 });
    render(<ModelDownload onComplete={() => {}} />);

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
  });

  it("shows the indeterminate pulse (no progressbar) when progress is null", async () => {
    invokeMock.mockResolvedValue({ phase: "loading", progress: null });
    render(<ModelDownload onComplete={() => {}} />);

    await screen.findByText(/loading model/i);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("plays the singing beaver while setting up", async () => {
    invokeMock.mockResolvedValue({ phase: "downloading", progress: 0.1 });
    const { container } = render(<ModelDownload onComplete={() => {}} />);

    await screen.findByRole("progressbar");
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("beaver-singing.webp");
  });

  it("calls onComplete once the phase is ready", async () => {
    invokeMock.mockResolvedValue({ phase: "ready", progress: null });
    const onComplete = vi.fn();
    render(<ModelDownload onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});

describe("ModelDownload failure", () => {
  beforeEach(() => invokeMock.mockReset());

  it("shows the failure detail from the backend", async () => {
    invokeMock.mockResolvedValue({
      phase: "error",
      progress: null,
      detail: "Beaver needs about 8 GB free to set up its on-device model. Free up space and try again.",
    });
    render(<ModelDownload onComplete={() => {}} />);

    expect(await screen.findByText(/8 GB free/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue anyway/i })).not.toBeInTheDocument();
  });

  it("falls back to generic copy when there is no detail", async () => {
    invokeMock.mockResolvedValue({ phase: "error", progress: null, detail: null });
    render(<ModelDownload onComplete={() => {}} />);

    expect(await screen.findByText(/couldn't finish setting up/i)).toBeInTheDocument();
  });

  it("Try again invokes retry_setup and resumes polling", async () => {
    invokeMock.mockResolvedValue({ phase: "error", progress: null, detail: null });
    render(<ModelDownload onComplete={() => {}} />);

    const btn = await screen.findByRole("button", { name: /try again/i });
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "mlx_status" ? { phase: "downloading", progress: 0.3, detail: null } : undefined
    );
    fireEvent.click(btn);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("retry_setup"));
    // Only a re-armed poll loop can fetch and render this status — the
    // optimistic local reset shows "Preparing environment…", not this.
    expect(await screen.findByText(/downloading model/i)).toBeInTheDocument();
    expect((await screen.findByRole("progressbar")).getAttribute("aria-valuenow")).toBe("30");
  });
});
