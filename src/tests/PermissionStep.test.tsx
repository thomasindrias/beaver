import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { PermissionStep } from "../components/PermissionStep";

describe("PermissionStep", () => {
  beforeEach(() => invokeMock.mockReset());

  it("asks for access while the permission is missing", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "screen_permission_granted" ? false : undefined
    );
    render(<PermissionStep />);

    const grant = await screen.findByRole("button", { name: /grant access/i });
    fireEvent.click(grant);
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("request_screen_permission")
    );
  });

  it("offers the System Settings deep link", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "screen_permission_granted" ? false : undefined
    );
    render(<PermissionStep />);

    fireEvent.click(await screen.findByRole("button", { name: /open system settings/i }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_screen_recording_settings")
    );
  });

  it("switches to relaunch once access is granted", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "screen_permission_granted" ? true : undefined
    );
    render(<PermissionStep />);

    const relaunch = await screen.findByRole("button", { name: /relaunch beaver/i });
    fireEvent.click(relaunch);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("relaunch_app"));
  });
});
