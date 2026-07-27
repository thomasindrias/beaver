import { invoke } from "@tauri-apps/api/core";
import type { ExtractFormat } from "../types";

// Typed mirror of the backend command surface (src-tauri/src/commands.rs).
// Every Tauri command the frontend uses goes through here, so command names
// and payload shapes live in exactly one place on each side of the IPC
// boundary.

export type EngineKind = "local" | "cloud";

export interface Settings {
  default_format: ExtractFormat;
  shortcut: string;
  history_retention_days: number | null;
  update_check_enabled: boolean;
  engine: EngineKind;
  cloud_base_url: string;
  cloud_model: string;
}

/** An extraction plus the engine that actually produced it. */
export interface ExtractionResult {
  text: string;
  engine: EngineKind;
}

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type EnginePhase =
  | "preparing"
  | "starting"
  | "downloading"
  | "loading"
  | "ready"
  | "error";

export interface EngineStatusReport {
  phase: EnginePhase;
  /** Download progress 0.0–1.0 during the downloading phase; null otherwise. */
  progress: number | null;
  /** User-readable failure reason when phase === "error". */
  detail?: string | null;
}

export interface UpdateInfo {
  version: string;
  url: string;
}

/** Capture a screen region and extract it. */
export const captureAndExtract = (region: CaptureRegion, format: ExtractFormat) =>
  invoke<ExtractionResult>("capture_and_extract", { region, format });

/** Re-run extraction on the last capture with a new format and optional hint. */
export const reExtract = (format: ExtractFormat, hint?: string) =>
  invoke<ExtractionResult>("re_extract", { format, hint: hint ?? null });

export const engineStatus = () => invoke<EngineStatusReport>("engine_status");

export const writeToClipboard = (text: string) =>
  invoke<void>("write_to_clipboard", { text });

export const finishOnboarding = () => invoke<void>("finish_onboarding");

export const retrySetup = () => invoke<void>("retry_setup");

export const screenPermissionGranted = () =>
  invoke<boolean>("screen_permission_granted");

export const requestScreenPermission = () =>
  invoke<boolean>("request_screen_permission");

export const openScreenRecordingSettings = () =>
  invoke<void>("open_screen_recording_settings");

export const relaunchApp = () => invoke<void>("relaunch_app");

export const checkForUpdate = () => invoke<UpdateInfo | null>("check_for_update");

/** Open a URL externally; the backend allowlists our own GitHub pages only. */
export const openExternal = (url: string) => invoke<void>("open_external", { url });

export const getSettings = () => invoke<Settings>("get_settings");

export const updateSettings = (next: Settings) =>
  invoke<Settings>("update_settings", { next });

export const openSettings = () => invoke<void>("open_settings");

export const setCloudApiKey = (key: string) =>
  invoke<void>("set_cloud_api_key", { key });

/** Whether a key is stored. The key itself never crosses the IPC boundary. */
export const hasCloudApiKey = () => invoke<boolean>("has_cloud_api_key");

/** Deletes the stored key. Also resets a stored cloud engine back to local,
 *  since a cloud engine with no key cannot run. Resolves to the updated settings. */
export const deleteCloudApiKey = () => invoke<Settings>("delete_cloud_api_key");
