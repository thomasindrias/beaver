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

  // Regression coverage for the atomic-save fix: the key and the config it
  // authenticates to must commit through a single command, never through two
  // independent ones that a global shortcut could race between.
  it("saving calls save_cloud_config with the draft settings and the key together, and never renders the key back", async () => {
    const saved = {
      ...BASE_SETTINGS,
      engine: "cloud" as const,
      cloud_base_url: "https://api.openai.com/v1",
      cloud_model: "gpt-4o-mini",
    };
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "has_cloud_api_key") return false;
      if (cmd === "save_cloud_config") return saved;
      return undefined;
    });
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    fireEvent.click(await screen.findByRole("button", { name: "OpenAI" }));
    const field = await screen.findByLabelText("API key");
    fireEvent.change(field, { target: { value: "sk-secret-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Use cloud engine" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("save_cloud_config", {
        next: saved,
        apiKey: "sk-secret-123",
      })
    );
    expect(await screen.findByText("Key stored")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
  });

  it("saving without typing a key sends a null apiKey, leaving the stored key untouched", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "has_cloud_api_key") return true;
      if (cmd === "save_cloud_config") return BASE_SETTINGS;
      return undefined;
    });
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    await screen.findByLabelText("Base URL");
    fireEvent.click(screen.getByRole("button", { name: "Use cloud engine" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "save_cloud_config",
        expect.objectContaining({ apiKey: null })
      )
    );
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
      if (cmd === "save_cloud_config") throw new Error("Cloud engine needs an API key. Save one first.");
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

  it("shows a shortcut conflict next to the shortcut field, not in the cloud panel", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "has_cloud_api_key") return false;
      if (cmd === "update_settings") throw new Error("'CmdOrCtrl+Shift+X' is already taken");
      return undefined;
    });
    render(<SettingsPanel />);
    // Open the cloud panel first: the bug was that an open panel captured
    // unrelated shortcut errors.
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    await screen.findByLabelText("Base URL");

    fireEvent.click(screen.getByTestId("shortcut-field"));
    fireEvent.keyDown(window, { key: "X", metaKey: true, shiftKey: true });

    const message = await screen.findByText(/already taken/);
    expect(message).toBeInTheDocument();
    // The message must not be rendered inside the cloud configuration block.
    expect(screen.getByLabelText("Base URL").closest("div")).not.toContainElement(message);
  });

  it("choosing local closes the cloud panel", async () => {
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    expect(await screen.findByLabelText("Base URL")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "🔒 Local (on-device)" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument()
    );
  });

  // The prior version of this test returned engine: "local" from
  // delete_cloud_api_key, which collapses the whole cloud panel and makes
  // "Key stored" disappear because its container unmounted, not because
  // hasKey flipped. Keeping engine: "cloud" here isolates the real claim:
  // only hasKey can explain the indicator vanishing while the panel stays up.
  it("removing a stored key clears the stored-key indicator", async () => {
    const afterRemoval = { ...CLOUD_SETTINGS, engine: "cloud" as const };
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return CLOUD_SETTINGS;
      if (cmd === "has_cloud_api_key") return true;
      if (cmd === "delete_cloud_api_key") return afterRemoval;
      if (cmd === "update_settings") return CLOUD_SETTINGS;
      return undefined;
    });
    render(<SettingsPanel />);
    expect(await screen.findByText("Key stored")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove key" }));
    await waitFor(() => expect(screen.queryByText("Key stored")).not.toBeInTheDocument());
    // The panel itself must still be mounted — only the indicator changed.
    expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
  });

  it("removing the key backing an active cloud engine closes the cloud panel", async () => {
    const afterRemoval = { ...CLOUD_SETTINGS, engine: "local" as const };
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return CLOUD_SETTINGS;
      if (cmd === "has_cloud_api_key") return true;
      if (cmd === "delete_cloud_api_key") return afterRemoval;
      if (cmd === "update_settings") return CLOUD_SETTINGS;
      return undefined;
    });
    render(<SettingsPanel />);
    await screen.findByText("Key stored");
    expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove key" }));
    await waitFor(() => expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument());
  });

  it("shows 'Save cloud settings' instead of 'Use cloud engine' once cloud is already active", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return CLOUD_SETTINGS;
      if (cmd === "has_cloud_api_key") return true;
      if (cmd === "update_settings") return CLOUD_SETTINGS;
      return undefined;
    });
    render(<SettingsPanel />);
    await screen.findByLabelText("Base URL");
    expect(screen.getByRole("button", { name: "Save cloud settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use cloud engine" })).not.toBeInTheDocument();
  });

  it("flags a draft that no longer matches the saved cloud config with 'Unsaved changes'", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return CLOUD_SETTINGS;
      if (cmd === "has_cloud_api_key") return true;
      return undefined;
    });
    render(<SettingsPanel />);
    await screen.findByLabelText("Base URL");
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Anthropic" }));
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
  });

  it("flags a pending, unsaved key with 'Unsaved changes' even when the URL and model are untouched", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return CLOUD_SETTINGS;
      if (cmd === "has_cloud_api_key") return true;
      return undefined;
    });
    render(<SettingsPanel />);
    const field = await screen.findByLabelText("API key");
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "sk-new-key" } });
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
  });

  // This is the regression test for the critical bug: switching providers
  // while cloud is already active must be committable through the panel, and
  // through the same one action that also carries any pending key — not a
  // config save and a key save that a global shortcut could fire between,
  // mispairing a provider's URL with another provider's key.
  it("committing while cloud is already active saves the current draft (a provider switch), not the stale persisted config", async () => {
    const savedAnthropicConfig = {
      ...CLOUD_SETTINGS,
      cloud_base_url: "https://api.anthropic.com/v1",
      cloud_model: "claude-haiku-4-5-20251001",
    };
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return CLOUD_SETTINGS;
      if (cmd === "has_cloud_api_key") return true;
      if (cmd === "save_cloud_config") return savedAnthropicConfig;
      return undefined;
    });
    render(<SettingsPanel />);
    await screen.findByLabelText("Base URL");
    fireEvent.click(screen.getByRole("button", { name: "Anthropic" }));
    fireEvent.click(screen.getByRole("button", { name: "Save cloud settings" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("save_cloud_config", {
        next: savedAnthropicConfig,
        apiKey: null,
      })
    );
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  // Regression coverage for the last credential-mispairing hole: switching
  // providers without typing that provider's own key must be rejected by the
  // backend, and the rejection must actually reach the user in the cloud
  // panel (cloudError), not silently vanish.
  it("surfaces the backend's provider-change rejection in the cloud panel when no new key is typed", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return CLOUD_SETTINGS;
      if (cmd === "has_cloud_api_key") return true;
      if (cmd === "save_cloud_config") {
        throw new Error(
          "Changing the provider needs that provider's own API key. Enter it below and save again."
        );
      }
      return undefined;
    });
    render(<SettingsPanel />);
    await screen.findByLabelText("Base URL");
    fireEvent.click(screen.getByRole("button", { name: "Anthropic" }));
    fireEvent.click(screen.getByRole("button", { name: "Save cloud settings" }));

    const message = await screen.findByText(/own API key/);
    expect(message).toBeInTheDocument();
    // The error must render inside the cloud configuration block: the Base
    // URL field's row and the error share the same panel as their nearest
    // common container.
    const cloudPanel = screen.getByLabelText("Base URL").closest("div")?.parentElement;
    expect(cloudPanel).toContainElement(message);
    // A failed save must not clobber the settings the user is still
    // looking at — the panel should still show the (unsaved) Anthropic
    // draft, not silently revert.
    expect(screen.getByLabelText("Base URL")).toHaveValue("https://api.anthropic.com/v1");
  });

  it("no longer offers an independent 'Save key' action", async () => {
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    await screen.findByLabelText("API key");
    expect(screen.queryByRole("button", { name: "Save key" })).not.toBeInTheDocument();
  });
});
