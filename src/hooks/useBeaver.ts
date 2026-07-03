import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppState, Capture } from "../types";

interface CaptureRegion { x: number; y: number; width: number; height: number }

// How long the result bubble lingers before the overlay window closes. Kept
// short because the window stays interactive (it tracks the cursor), so it
// briefly blocks the screen.
export const SUCCESS_DWELL_MS = 1500;
export const ERROR_DWELL_MS = 2500;
export const PERMISSION_ERROR_DWELL_MS = 4000;

export type CaptureErrorKind = "generic" | "permission";

export function useBeaver(
  onSave?: (capture: Omit<Capture, "id" | "created_at">) => Promise<void>,
  onComplete?: () => void,
) {
  const [state, setState] = useState<AppState>("idle");
  const [errorKind, setErrorKind] = useState<CaptureErrorKind>("generic");

  const runCapture = useCallback(async (region: CaptureRegion) => {
    setState("processing");
    try {
      const markdown: string = await invoke("capture_and_extract", { region });
      const contentType = detectContentType(markdown);

      await invoke("write_to_clipboard", { text: markdown });

      if (onSave) {
        await onSave({
          content: markdown,
          content_type: contentType,
          char_count: markdown.length,
          app_context: null,
        });
      }

      setState("success");
      setTimeout(() => {
        setState("idle");
        onComplete?.();
      }, SUCCESS_DWELL_MS);
    } catch (e) {
      const kind: CaptureErrorKind = String(e).includes("screen-permission-missing")
        ? "permission"
        : "generic";
      setErrorKind(kind);
      setState("error");
      setTimeout(() => {
        setState("idle");
        onComplete?.();
      }, kind === "permission" ? PERMISSION_ERROR_DWELL_MS : ERROR_DWELL_MS);
    }
  }, [onSave, onComplete]);

  return { state, errorKind, runCapture };
}

function detectContentType(md: string): Capture["content_type"] {
  const hasTable = /\|[-: ]+\|/.test(md);
  const hasCode = md.includes("```");
  const hasList = md.split("\n").some(l => /^\s*[-*] /.test(l));
  const count = [hasTable, hasCode, hasList].filter(Boolean).length;
  if (count > 1) return "mixed";
  if (hasTable) return "table";
  if (hasCode) return "code";
  if (hasList) return "list";
  return "prose";
}
