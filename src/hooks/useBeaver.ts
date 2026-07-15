import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppState, Capture, ContentType, ExtractFormat } from "../types";

interface CaptureRegion { x: number; y: number; width: number; height: number }

// Success auto-dismiss is short: the HUD's job is done unless the user
// reaches for it. Errors linger longer so their action chip can be read,
// but still self-clear — the fullscreen overlay must never block the
// screen indefinitely on a walk-away.
export const SUCCESS_DWELL_MS = 1500;
export const ERROR_DWELL_MS = 6000;

export type CaptureErrorKind = "generic" | "permission";

export function useBeaver(
  onSave?: (capture: Omit<Capture, "id" | "created_at">) => Promise<void>,
  onComplete?: () => void,
) {
  const [state, setState] = useState<AppState>("idle");
  const [errorKind, setErrorKind] = useState<CaptureErrorKind>("generic");
  const [format, setFormat] = useState<ExtractFormat>("markdown");
  const [contentType, setContentType] = useState<ContentType>("prose");
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regionRef = useRef<CaptureRegion | null>(null);
  const savedRef = useRef(false);
  const engagedRef = useRef(false);

  const clearDwell = useCallback(() => {
    if (dwellRef.current) {
      clearTimeout(dwellRef.current);
      dwellRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearDwell();
    setState("idle");
    onComplete?.();
  }, [clearDwell, onComplete]);

  const armDwell = useCallback((ms: number) => {
    clearDwell();
    dwellRef.current = setTimeout(() => {
      if (!engagedRef.current) dismiss();
    }, ms);
  }, [clearDwell, dismiss]);

  const engage = useCallback(() => {
    engagedRef.current = true;
    clearDwell();
  }, [clearDwell]);

  const finish = useCallback(async (markdown: string) => {
    const ct = detectContentType(markdown);
    setContentType(ct);
    await invoke("write_to_clipboard", { text: markdown });
    if (onSave && !savedRef.current) {
      savedRef.current = true;
      await onSave({
        content: markdown,
        content_type: ct,
        char_count: markdown.length,
        app_context: null,
      });
    }
    setState("success");
    armDwell(SUCCESS_DWELL_MS);
  }, [onSave, armDwell]);

  const fail = useCallback((e: unknown) => {
    const kind: CaptureErrorKind = String(e).includes("screen-permission-missing")
      ? "permission"
      : "generic";
    setErrorKind(kind);
    setState("error");
    armDwell(ERROR_DWELL_MS);
  }, [armDwell]);

  const runCapture = useCallback(async (region: CaptureRegion) => {
    regionRef.current = region;
    setState("processing");
    try {
      const markdown: string = await invoke("capture_and_extract", {
        region,
        format: "markdown",
      });
      setFormat("markdown");
      await finish(markdown);
    } catch (e) {
      fail(e);
    }
  }, [finish, fail]);

  const reExtract = useCallback(async (next: ExtractFormat, hint?: string) => {
    engage();
    setFormat(next);
    setState("rerendering");
    try {
      const markdown: string = await invoke("re_extract", {
        format: next,
        hint: hint ?? null,
      });
      await finish(markdown);
    } catch (e) {
      fail(e);
    }
  }, [engage, finish, fail]);

  const retry = useCallback(async () => {
    if (regionRef.current) await runCapture(regionRef.current);
  }, [runCapture]);

  return { state, errorKind, format, contentType, runCapture, reExtract, retry, engage, dismiss };
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
