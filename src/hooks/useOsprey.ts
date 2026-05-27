import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppState, Capture } from "../types";

interface CaptureRegion { x: number; y: number; width: number; height: number }

export function useOsprey(onSave?: (capture: Omit<Capture, "id" | "created_at">) => Promise<void>) {
  const [state, setState] = useState<AppState>("idle");

  const runCapture = useCallback(async (region: CaptureRegion) => {
    setState("processing");
    try {
      const imageBase64: string = await invoke("capture_screen_region", { region });
      const markdown: string = await invoke("extract_from_image", { imageBase64 });
      const contentType = detectContentType(markdown);

      await invoke("write_to_clipboard", { text: markdown });
      await invoke("show_success_notification");

      if (onSave) {
        await onSave({
          content: markdown,
          content_type: contentType,
          char_count: markdown.length,
          app_context: null,
        });
      }

      setState("success");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }, [onSave]);

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
