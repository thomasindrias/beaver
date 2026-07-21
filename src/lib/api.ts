import { invoke } from "@tauri-apps/api/core";
import type { ExtractFormat } from "../types";

// Typed mirror of the backend command surface (src-tauri/src/commands.rs).
// Every Tauri command the frontend uses goes through here, so command names
// and payload shapes live in exactly one place on each side of the IPC
// boundary.

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

/** Capture a screen region and extract it; resolves to the extracted text. */
export const captureAndExtract = (region: CaptureRegion, format: ExtractFormat) =>
  invoke<string>("capture_and_extract", { region, format });

/** Re-run extraction on the last capture with a new format and optional hint. */
export const reExtract = (format: ExtractFormat, hint?: string) =>
  invoke<string>("re_extract", { format, hint: hint ?? null });

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
