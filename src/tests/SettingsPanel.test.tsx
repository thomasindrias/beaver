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
  engine: "local" as const,
  cloud_base_url: "",
  cloud_model: "",
};

describe("SettingsPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "update_settings") return BASE_SETTINGS;
      if (cmd === "has_cloud_api_key") return false;
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

  const CLOUD_SETTINGS = {
    ...BASE_SETTINGS,
    engine: "cloud" as const,
    cloud_base_url: "https://api.openai.com/v1",
    cloud_model: "gpt-4o-mini",
  };

  it("offers both engines with local selected by default", async () => {
    render(<SettingsPanel />);
    expect(
      await screen.findByRole("button", { name: "🔒 Local (on-device)" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "☁️ Cloud" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("hides the cloud fields while local is selected", async () => {
    render(<SettingsPanel />);
    await screen.findByRole("button", { name: "🔒 Local (on-device)" });
    expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("reveals the cloud fields once cloud is selected", async () => {
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    expect(await screen.findByLabelText("Base URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
  });

  it("a provider preset prefills the base URL and model", async () => {
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    fireEvent.click(await screen.findByRole("button", { name: "Anthropic" }));
    expect(await screen.findByLabelText("Base URL")).toHaveValue(
      "https://api.anthropic.com/v1"
    );
    expect(screen.getByLabelText("Model")).toHaveValue("claude-haiku-4-5-20251001");
  });

  it("saving a key calls set_cloud_api_key and never renders it back", async () => {
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    const field = await screen.findByLabelText("API key");
    fireEvent.change(field, { target: { value: "sk-secret-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_cloud_api_key", {
        key: "sk-secret-123",
      })
    );
    expect(await screen.findByText("Key stored")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
  });

  it("the API key field masks its input", async () => {
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    expect(await screen.findByLabelText("API key")).toHaveAttribute("type", "password");
  });

  it("surfaces a rejected cloud configuration and stays on local", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "has_cloud_api_key") return false;
      if (cmd === "update_settings") throw new Error("Cloud engine needs an API key. Save one first.");
      return undefined;
    });
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use cloud engine" }));
    expect(
      await screen.findByText(/Cloud engine needs an API key/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "🔒 Local (on-device)" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("removing a stored key calls delete_cloud_api_key", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return CLOUD_SETTINGS;
      if (cmd === "has_cloud_api_key") return true;
      if (cmd === "update_settings") return CLOUD_SETTINGS;
      return undefined;
    });
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove key" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("delete_cloud_api_key")
    );
  });
});
