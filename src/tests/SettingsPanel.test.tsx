import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { SettingsPanel } from "../components/SettingsPanel";

const BASE_SETTINGS = {
  default_format: "markdown" as const,
  shortcut: "CmdOrCtrl+Shift+D",
  history_retention_days: null,
  update_check_enabled: true,
};

describe("SettingsPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "update_settings") return BASE_SETTINGS;
      return undefined;
    });
  });

  it("renders the current settings once loaded", async () => {
    render(<SettingsPanel />);
    expect(await screen.findByText("CmdOrCtrl+Shift+D")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("changing the format calls update_settings with the new value", async () => {
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_settings", {
        next: { ...BASE_SETTINGS, default_format: "json" },
      })
    );
  });

  it("toggling the update-check switch flips update_check_enabled", async () => {
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    fireEvent.click(screen.getByRole("button", { name: "Check automatically" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_settings", {
        next: { ...BASE_SETTINGS, update_check_enabled: false },
      })
    );
  });

  it("selecting a retention window calls update_settings with the day count", async () => {
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_settings", {
        next: { ...BASE_SETTINGS, history_retention_days: 30 },
      })
    );
  });

  it("recording a new shortcut applies it on keydown", async () => {
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    fireEvent.click(screen.getByTestId("shortcut-field"));
    expect(await screen.findByText("Press new shortcut…")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "x", metaKey: true, shiftKey: true });
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_settings", {
        next: { ...BASE_SETTINGS, shortcut: "CmdOrCtrl+Shift+X" },
      })
    );
  });

  it("shows an inline error and keeps the old shortcut when the update is rejected", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "update_settings") throw new Error("'CmdOrCtrl+Shift+X' is already taken");
      return undefined;
    });
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    fireEvent.click(screen.getByTestId("shortcut-field"));
    fireEvent.keyDown(window, { key: "x", metaKey: true, shiftKey: true });
    expect(
      await screen.findByText("'CmdOrCtrl+Shift+X' is already taken")
    ).toBeInTheDocument();
    expect(screen.getByText("CmdOrCtrl+Shift+D")).toBeInTheDocument();
  });

  it("the engine row is static and non-interactive", async () => {
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    expect(screen.getByRole("button", { name: /Local \(on-device\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cloud \(coming soon\)/ })).toBeDisabled();
  });
});
