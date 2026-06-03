import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppState, Capture } from "../types";

interface CaptureRegion { x: number; y: number; width: number; height: number }

// How long the result bubble lingers before the overlay window closes. Kept
// short because the window stays interactive (it tracks the cursor), so it
// briefly blocks the screen.
export const SUCCESS_DWELL_MS = 1500;
export const ERROR_DWELL_MS = 2500;

export function useBeaver(
  onSave?: (capture: Omit<Capture, "id" | "created_at">) => Promise<void>,
  onComplete?: () => void,
) {
  const [state, setState] = useState<AppState>("idle");

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
    } catch {
      setState("error");
      setTimeout(() => {
        setState("idle");
        onComplete?.();
      }, ERROR_DWELL_MS);
    }
  }, [onSave, onComplete]);

  return { state, runCapture };
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
