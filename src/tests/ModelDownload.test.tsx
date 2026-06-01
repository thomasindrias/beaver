import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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
