import { describe, it, expect, vi, beforeEach } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import * as api from "../lib/api";

// api.ts is the single registry of backend command names — these tests pin
// each wrapper to the exact command string and payload shape the Rust side
// (src-tauri/src/commands.rs) expects.
describe("api", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue(undefined);
  });

  it("captureAndExtract sends the region and format", async () => {
    const region = { x: 1, y: 2, width: 30, height: 40 };
    await api.captureAndExtract(region, "markdown");
    expect(invokeMock).toHaveBeenCalledWith("capture_and_extract", {
      region,
      format: "markdown",
    });
  });

  it("reExtract sends the format and a null hint when omitted", async () => {
    await api.reExtract("csv");
    expect(invokeMock).toHaveBeenCalledWith("re_extract", {
      format: "csv",
      hint: null,
    });
  });

  it("reExtract passes a hint through", async () => {
    await api.reExtract("json", "headers are dates");
    expect(invokeMock).toHaveBeenCalledWith("re_extract", {
      format: "json",
      hint: "headers are dates",
    });
  });

  it("engineStatus queries the backend status", async () => {
    invokeMock.mockResolvedValue({ phase: "ready", progress: null });
    const status = await api.engineStatus();
    expect(invokeMock).toHaveBeenCalledWith("engine_status");
    expect(status.phase).toBe("ready");
  });

  it("writeToClipboard sends the text", async () => {
    await api.writeToClipboard("| a | b |");
    expect(invokeMock).toHaveBeenCalledWith("write_to_clipboard", {
      text: "| a | b |",
    });
  });

  it("openExternal sends the url", async () => {
    await api.openExternal("https://github.com/thomasindrias/beaver");
    expect(invokeMock).toHaveBeenCalledWith("open_external", {
      url: "https://github.com/thomasindrias/beaver",
    });
  });

  it("getSettings queries the backend", async () => {
    const settings = {
      default_format: "markdown" as const,
      shortcut: "CmdOrCtrl+Shift+D",
      history_retention_days: null,
      update_check_enabled: true,
    };
    invokeMock.mockResolvedValue(settings);
    const result = await api.getSettings();
    expect(invokeMock).toHaveBeenCalledWith("get_settings");
    expect(result).toEqual(settings);
  });

  it("updateSettings sends the full settings object", async () => {
    const next = {
      default_format: "json" as const,
      shortcut: "CmdOrCtrl+Shift+X",
      history_retention_days: 30,
      update_check_enabled: false,
    };
    invokeMock.mockResolvedValue(next);
    await api.updateSettings(next);
    expect(invokeMock).toHaveBeenCalledWith("update_settings", { next });
  });

  it.each([
    ["retrySetup", "retry_setup"],
    ["finishOnboarding", "finish_onboarding"],
    ["screenPermissionGranted", "screen_permission_granted"],
    ["requestScreenPermission", "request_screen_permission"],
    ["openScreenRecordingSettings", "open_screen_recording_settings"],
    ["relaunchApp", "relaunch_app"],
    ["checkForUpdate", "check_for_update"],
    ["openSettings", "open_settings"],
  ] as const)("%s invokes %s with no payload", async (fn, command) => {
    await api[fn]();
    expect(invokeMock).toHaveBeenCalledWith(command);
  });
});
