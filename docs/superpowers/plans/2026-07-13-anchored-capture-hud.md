# Anchored Capture HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cursor-following toast with a HUD pill anchored to the capture selection, offering format switching (Markdown/CSV/JSON/plain), a horizontally expanding custom-hint input, a Tab-lap keyboard model, and processing/error states — per the "Post-capture UX" section of `docs/ROADMAP.md`.

**Architecture:** The Rust side caches the last captured image bytes so re-extraction (new format or hint) reuses the exact pixels without re-shooting. Format→prompt mapping is a pure Rust function; the Python server already accepts an arbitrary prompt per request and needs **no changes**. The frontend replaces `CursorToast` with a new `CaptureHud` component anchored via a pure positioning helper; `useBeaver` grows into a small state machine (`idle → processing → success ⇄ rerendering`, plus `error`), and `App.tsx` keeps the selection rectangle frozen on screen as the HUD's anchor while managing window click-through per state.

**Tech Stack:** React 19 + TypeScript + Vite 7, Tailwind CSS v4, lucide-react icons, vitest + @testing-library/react; Tauri 2 (Rust, reqwest, serde); existing FastAPI/MLX server untouched.

## Global Constraints

- macOS Apple Silicon required only for *manual* verification; all automated tests run anywhere.
- TDD for every behavior change: failing test → minimal code → pass → commit.
- No new dependencies. `lucide-react`, Tailwind v4, vitest are already installed.
- Do not touch Tauri permissions, entitlements, CSP (`src-tauri/tauri.conf.json`), or network behavior.
- Do not modify `src-tauri/resources/mlx_server.py` — it already accepts a per-request `prompt`.
- Frontend tests: `pnpm test:run` (single run). Rust tests: `cargo test` inside `src-tauri/`.
- Commit after every task with a conventional-commit message ending in `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Design source of truth: "Decided product principles → Post-capture UX" in `docs/ROADMAP.md`. Key copy strings (exact): `Copied as table`, `Dam — couldn't read that`, `Needs Screen Recording access`.

## File Structure

| File | Responsibility |
|---|---|
| `src-tauri/src/mlx.rs` (modify) | `ExtractFormat` enum, `prompt_for()` pure mapping, `extract_from_image` takes a prompt param |
| `src-tauri/src/lib.rs` (modify) | `LastCapture` cached-bytes state, `capture_and_extract` gains optional format + stores bytes, new `re_extract` command |
| `src/types.ts` (modify) | `ExtractFormat` union; `AppState` gains `"rerendering"` |
| `src/lib/hudPosition.ts` (create) | Pure anchor math: below the selection, flips above near the bottom edge, clamps to viewport |
| `src/components/CaptureHud.tsx` (create) | The pill: processing/copied/chips/input/error states, Tab lap, debounced format commit; owns `LOADING_MESSAGES` |
| `src/components/CaptureOverlay.tsx` (modify) | Optional `frozen` prop renders the selection ring only (no handlers) as the HUD anchor visual |
| `src/App.tsx` (modify) | Capture-view wiring: frozen overlay + HUD, window click-through per state, click-away dismiss |
| `src/components/CursorToast.tsx` (delete) | Retired — replaced by `CaptureHud` |
| `src/tests/hudPosition.test.ts`, `src/tests/CaptureHud.test.tsx` (create); `src/tests/useBeaver.test.ts`, `src/tests/App.test.tsx`, `src/tests/CaptureOverlay.test.tsx` (modify); `src/tests/CursorToast.test.tsx` (delete) | Tests |
| `CHANGELOG.md` (modify) | Unreleased entry |

**Design decision recorded here (not in the roadmap):** switching chips fires a model call (seconds, not instant), so Tab-lap format changes are **debounced** — the active chip highlight moves instantly, but `onFormatChange` commits only after `FORMAT_COMMIT_MS = 400` ms without further lap movement. Clicking a chip or pressing `1–4` commits immediately (deliberate choice). Re-renders update the clipboard only; history keeps the first extraction (v1 simplification, noted in CHANGELOG).

---

### Task 1: Rust format prompts (`prompt_for`)

**Files:**
- Modify: `src-tauri/src/mlx.rs`
- Modify: `src-tauri/src/lib.rs:467` (the one existing `extract_from_image` call site)

**Interfaces:**
- Consumes: existing `EXTRACTION_PROMPT`, `extract_from_image(port, image_base64)`.
- Produces: `pub enum ExtractFormat { Markdown, Csv, Json, Plain }` (serde, lowercase); `pub fn prompt_for(format: ExtractFormat, hint: Option<&str>) -> String`; `pub async fn extract_from_image(port: u16, image_base64: &str, prompt: &str) -> Result<String, String>`. Task 2 relies on these exact signatures.

- [ ] **Step 1: Write the failing tests** — append inside `mod tests` in `src-tauri/src/mlx.rs`:

```rust
    #[test]
    fn prompt_for_markdown_without_hint_is_the_default_prompt() {
        assert_eq!(prompt_for(ExtractFormat::Markdown, None), EXTRACTION_PROMPT);
    }

    #[test]
    fn prompt_for_each_format_names_its_output_shape() {
        assert!(prompt_for(ExtractFormat::Csv, None).contains("CSV"));
        assert!(prompt_for(ExtractFormat::Json, None).contains("JSON"));
        assert!(prompt_for(ExtractFormat::Plain, None).contains("plain text"));
    }

    #[test]
    fn prompt_for_appends_a_trimmed_hint() {
        let p = prompt_for(ExtractFormat::Csv, Some("  headers are dates "));
        assert!(p.ends_with("headers are dates"));
        assert!(p.contains("Additional instruction"));
    }

    #[test]
    fn prompt_for_ignores_blank_hints() {
        assert_eq!(
            prompt_for(ExtractFormat::Plain, Some("   ")),
            prompt_for(ExtractFormat::Plain, None)
        );
    }

    #[test]
    fn extract_format_deserializes_from_lowercase_json() {
        let f: ExtractFormat = serde_json::from_str("\"csv\"").unwrap();
        assert_eq!(f, ExtractFormat::Csv);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test prompt_for`
Expected: compile error — `ExtractFormat` and `prompt_for` not found.

- [ ] **Step 3: Implement** — in `src-tauri/src/mlx.rs`, below `EXTRACTION_PROMPT`:

```rust
#[derive(serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ExtractFormat {
    Markdown,
    Csv,
    Json,
    Plain,
}

const CSV_PROMPT: &str =
    "Extract the data visible in this image as CSV. \
     Use the first row for column headers. Quote fields that contain commas. \
     If the image has no tabular data, emit a single `text` column with one row per line. \
     Output only the CSV — no commentary, no code fences.";

const JSON_PROMPT: &str =
    "Extract the data visible in this image as JSON. \
     Prefer an array of objects with descriptive keys for tabular data; \
     otherwise mirror the visible structure using objects and arrays. \
     Output only valid JSON — no commentary, no code fences.";

const PLAIN_PROMPT: &str =
    "Extract all text visible in this image as plain text. \
     Preserve reading order and line breaks. No markup, no commentary.";

pub fn prompt_for(format: ExtractFormat, hint: Option<&str>) -> String {
    let base = match format {
        ExtractFormat::Markdown => EXTRACTION_PROMPT,
        ExtractFormat::Csv => CSV_PROMPT,
        ExtractFormat::Json => JSON_PROMPT,
        ExtractFormat::Plain => PLAIN_PROMPT,
    };
    match hint.map(str::trim) {
        Some(h) if !h.is_empty() => format!("{base}\nAdditional instruction from the user: {h}"),
        _ => base.to_string(),
    }
}
```

Then change `extract_from_image` to take the prompt (replace the signature and the `body` construction):

```rust
pub async fn extract_from_image(
    port: u16,
    image_base64: &str,
    prompt: &str,
) -> Result<String, String> {
```

and inside, replace `"prompt": EXTRACTION_PROMPT,` with `"prompt": prompt,`.

Finally update the call site in `src-tauri/src/lib.rs` (currently line 467):

```rust
    let prompt = mlx::prompt_for(mlx::ExtractFormat::Markdown, None);
    mlx::extract_from_image(port, &image_base64, &prompt).await
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: all tests PASS (existing health/api_url tests plus the 5 new ones).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/mlx.rs src-tauri/src/lib.rs
git commit -m "feat: per-format extraction prompts with optional user hint"
```

---

### Task 2: Cached capture bytes + `re_extract` command

**Files:**
- Modify: `src-tauri/src/lib.rs` (the `capture_and_extract` command at ~line 456, the `generate_handler![...]` list at ~line 177, and the builder's `.manage(...)` chain — locate with `grep -n "manage(" src-tauri/src/lib.rs`)

**Interfaces:**
- Consumes: `mlx::ExtractFormat`, `mlx::prompt_for`, `mlx::extract_from_image` from Task 1.
- Produces: Tauri commands callable from JS — `capture_and_extract({ region, format? })` (format optional, defaults to markdown, so the current frontend keeps working) and `re_extract({ format, hint? }) -> string`. `re_extract` fails with the string `"no-capture-cached"` if no capture has run. Tasks 4/8 invoke these exact names and argument keys.

- [ ] **Step 1: Write the failing test** — append to the `tests` module at the bottom of `src-tauri/src/lib.rs` (create `mod tests` there if none exists; check with `grep -n "mod tests" src-tauri/src/lib.rs`):

```rust
    #[test]
    fn last_capture_starts_empty_and_roundtrips_bytes() {
        let last = LastCapture::default();
        assert!(last.0.lock().unwrap().is_none());
        *last.0.lock().unwrap() = Some(vec![1, 2, 3]);
        assert_eq!(last.0.lock().unwrap().clone().unwrap(), vec![1, 2, 3]);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test last_capture`
Expected: compile error — `LastCapture` not found.

- [ ] **Step 3: Implement** — in `src-tauri/src/lib.rs`:

```rust
/// The most recent capture's PNG bytes, kept so the HUD can re-extract with a
/// different format or hint without re-shooting the screen (which may have
/// changed, and which our own HUD could contaminate).
#[derive(Default)]
pub struct LastCapture(pub std::sync::Mutex<Option<Vec<u8>>>);
```

Add `.manage(LastCapture::default())` alongside the existing `.manage(...)` calls in the builder.

Replace `capture_and_extract` with:

```rust
#[tauri::command]
async fn capture_and_extract(
    region: capture::CaptureRegion,
    format: Option<mlx::ExtractFormat>,
    state: tauri::State<'_, server::MlxServer>,
    last: tauri::State<'_, LastCapture>,
) -> Result<String, String> {
    if !permission::screen_capture_granted() {
        return Err(permission::PERMISSION_ERROR.to_string());
    }
    let port = state.port;
    let bytes = capture::capture_region(&region).map_err(|e| e.to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    *last.0.lock().unwrap() = Some(bytes);
    let prompt = mlx::prompt_for(format.unwrap_or(mlx::ExtractFormat::Markdown), None);
    mlx::extract_from_image(port, &image_base64, &prompt).await
}

#[tauri::command]
async fn re_extract(
    format: mlx::ExtractFormat,
    hint: Option<String>,
    state: tauri::State<'_, server::MlxServer>,
    last: tauri::State<'_, LastCapture>,
) -> Result<String, String> {
    let bytes = last
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no-capture-cached".to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    let prompt = mlx::prompt_for(format, hint.as_deref());
    mlx::extract_from_image(state.port, &image_base64, &prompt).await
}
```

Add `re_extract,` to the `tauri::generate_handler![...]` list next to `capture_and_extract,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: all PASS, including `last_capture_starts_empty_and_roundtrips_bytes`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: cache capture bytes and add re_extract command"
```

---

### Task 3: Frontend types + `hudPosition` helper

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/hudPosition.ts`
- Test: `src/tests/hudPosition.test.ts`

**Interfaces:**
- Consumes: `Rect` from `src/components/CaptureOverlay.tsx`.
- Produces: `ExtractFormat` union and widened `AppState` in `src/types.ts`; `hudPosition(sel: Rect, viewport: {width: number; height: number}): {x: number; y: number; above: boolean}` plus exported constants `HUD_GAP`, `HUD_HEIGHT`, `HUD_MAX_WIDTH`, `HUD_MARGIN`. Tasks 4–8 import these.

- [ ] **Step 1: Update types** — in `src/types.ts` replace the `AppState` line and add the format union:

```ts
export type ExtractFormat = "markdown" | "csv" | "json" | "plain";

export type AppState = "idle" | "processing" | "success" | "rerendering" | "error";
```

- [ ] **Step 2: Write the failing tests** — create `src/tests/hudPosition.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hudPosition, HUD_GAP, HUD_HEIGHT, HUD_MARGIN, HUD_MAX_WIDTH } from "../lib/hudPosition";

const viewport = { width: 1440, height: 900 };

describe("hudPosition", () => {
  it("sits below the selection's bottom-left corner", () => {
    const sel = { x: 100, y: 100, width: 300, height: 200 };
    expect(hudPosition(sel, viewport)).toEqual({ x: 100, y: 300 + HUD_GAP, above: false });
  });

  it("flips above the selection near the bottom edge", () => {
    const sel = { x: 100, y: 700, width: 300, height: 900 - 700 - HUD_GAP };
    const pos = hudPosition(sel, viewport);
    expect(pos.above).toBe(true);
    expect(pos.y).toBe(700 - HUD_GAP - HUD_HEIGHT);
  });

  it("clamps to the left margin", () => {
    const sel = { x: 2, y: 100, width: 50, height: 50 };
    expect(hudPosition(sel, viewport).x).toBe(HUD_MARGIN);
  });

  it("clamps so an expanded pill never clips the right edge", () => {
    const sel = { x: 1400, y: 100, width: 30, height: 50 };
    expect(hudPosition(sel, viewport).x).toBe(1440 - HUD_MARGIN - HUD_MAX_WIDTH);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test:run src/tests/hudPosition.test.ts`
Expected: FAIL — cannot resolve `../lib/hudPosition`.

- [ ] **Step 4: Implement** — create `src/lib/hudPosition.ts`:

```ts
import type { Rect } from "../components/CaptureOverlay";

export const HUD_GAP = 10;
export const HUD_HEIGHT = 34;
export const HUD_MAX_WIDTH = 240;
export const HUD_MARGIN = 8;

export interface HudAnchor {
  x: number;
  y: number;
  above: boolean;
}

// Anchor below the selection's bottom-left corner; flip above when the pill
// would overflow the bottom edge; clamp horizontally so the fully expanded
// pill (input open) never clips the viewport.
export function hudPosition(
  sel: Rect,
  viewport: { width: number; height: number }
): HudAnchor {
  const below = sel.y + sel.height + HUD_GAP;
  const above = below + HUD_HEIGHT > viewport.height;
  const x = Math.max(
    HUD_MARGIN,
    Math.min(sel.x, viewport.width - HUD_MARGIN - HUD_MAX_WIDTH)
  );
  return {
    x,
    y: above ? Math.max(HUD_MARGIN, sel.y - HUD_GAP - HUD_HEIGHT) : below,
    above,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:run src/tests/hudPosition.test.ts`
Expected: 4 PASS. Also run `pnpm test:run` — the widened `AppState` must not break existing tests (it won't; the old union members still exist).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/hudPosition.ts src/tests/hudPosition.test.ts
git commit -m "feat: extract-format types and HUD anchor positioning helper"
```

---

### Task 4: `useBeaver` state machine

**Files:**
- Modify: `src/hooks/useBeaver.ts` (full rewrite below)
- Modify: `src/tests/useBeaver.test.ts`

**Interfaces:**
- Consumes: commands `capture_and_extract` (now called with `{ region, format: "markdown" }`) and `re_extract` (`{ format, hint }`) from Task 2; types from Task 3.
- Produces (Task 8 consumes exactly this):

```ts
{
  state: AppState;
  errorKind: "generic" | "permission";
  format: ExtractFormat;
  contentType: ContentType;
  runCapture: (region: CaptureRegion) => Promise<void>;
  reExtract: (format: ExtractFormat, hint?: string) => Promise<void>;
  retry: () => Promise<void>;
  engage: () => void;
  dismiss: () => void;
}
```

Also exports `SUCCESS_DWELL_MS = 1500`, `ERROR_DWELL_MS = 6000`, `CaptureErrorKind`.

- [ ] **Step 1: Rewrite the test file** — replace `src/tests/useBeaver.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { useBeaver, SUCCESS_DWELL_MS, ERROR_DWELL_MS } from "../hooks/useBeaver";

const region = { x: 0, y: 0, width: 10, height: 10 };

describe("useBeaver", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue("## Extracted content");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle with markdown as the active format", () => {
    const { result } = renderHook(() => useBeaver());
    expect(result.current.state).toBe("idle");
    expect(result.current.format).toBe("markdown");
  });

  it("requests markdown on the first capture and copies the result", async () => {
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(invokeMock).toHaveBeenCalledWith("capture_and_extract", {
      region,
      format: "markdown",
    });
    expect(invokeMock).toHaveBeenCalledWith("write_to_clipboard", {
      text: "## Extracted content",
    });
    expect(result.current.state).toBe("success");
  });

  it("detects the content type for the copied pill label", async () => {
    invokeMock.mockResolvedValue("| a | b |\n|---|---|\n| 1 | 2 |");
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.contentType).toBe("table");
  });

  it("auto-dismisses after the success dwell when not engaged", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBeaver(undefined, onComplete));
    await act(async () => {
      await result.current.runCapture(region);
    });
    act(() => {
      vi.advanceTimersByTime(SUCCESS_DWELL_MS);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("idle");
  });

  it("engage() cancels the auto-dismiss", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBeaver(undefined, onComplete));
    await act(async () => {
      await result.current.runCapture(region);
    });
    act(() => {
      result.current.engage();
      vi.advanceTimersByTime(SUCCESS_DWELL_MS * 4);
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.state).toBe("success");
  });

  it("reExtract re-runs with the new format and re-copies", async () => {
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    invokeMock.mockClear().mockResolvedValue("a,b\n1,2");
    await act(async () => {
      await result.current.reExtract("csv");
    });
    expect(invokeMock).toHaveBeenCalledWith("re_extract", {
      format: "csv",
      hint: null,
    });
    expect(invokeMock).toHaveBeenCalledWith("write_to_clipboard", {
      text: "a,b\n1,2",
    });
    expect(result.current.format).toBe("csv");
    expect(result.current.state).toBe("success");
  });

  it("reExtract passes the custom hint through", async () => {
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
      await result.current.reExtract("csv", "headers are dates");
    });
    expect(invokeMock).toHaveBeenCalledWith("re_extract", {
      format: "csv",
      hint: "headers are dates",
    });
  });

  it("saves to history only for the first successful extraction", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBeaver(onSave));
    await act(async () => {
      await result.current.runCapture(region);
      await result.current.reExtract("csv");
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("flags permission errors and keeps others generic", async () => {
    invokeMock.mockRejectedValue("screen-permission-missing");
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.state).toBe("error");
    expect(result.current.errorKind).toBe("permission");
  });

  it("errors auto-dismiss after the error dwell when not engaged", async () => {
    vi.useFakeTimers();
    invokeMock.mockRejectedValue("MLX request failed: boom");
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBeaver(undefined, onComplete));
    await act(async () => {
      await result.current.runCapture(region);
    });
    act(() => {
      vi.advanceTimersByTime(ERROR_DWELL_MS);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("retry re-runs the last region", async () => {
    invokeMock.mockRejectedValueOnce("MLX request failed: boom");
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.state).toBe("error");
    invokeMock.mockResolvedValue("recovered");
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.state).toBe("success");
  });

  it("dismiss goes idle and fires onComplete", async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBeaver(undefined, onComplete));
    await act(async () => {
      await result.current.runCapture(region);
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.state).toBe("idle");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/tests/useBeaver.test.ts`
Expected: FAIL — `format`, `reExtract`, `engage`, `dismiss`, `ERROR_DWELL_MS` undefined; `capture_and_extract` called without `format`.

- [ ] **Step 3: Rewrite the hook** — replace `src/hooks/useBeaver.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run src/tests/useBeaver.test.ts`
Expected: 12 PASS. (`src/tests/App.test.tsx` still passes because it mocks `useBeaver` wholesale.)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBeaver.ts src/tests/useBeaver.test.ts
git commit -m "feat: useBeaver state machine with re-extract, engage, and dismiss"
```

---

### Task 5: `CaptureHud` — rendering states

**Files:**
- Create: `src/components/CaptureHud.tsx`
- Test: `src/tests/CaptureHud.test.tsx`

**Interfaces:**
- Consumes: types from Task 3, `CaptureErrorKind` from Task 4.
- Produces: `CaptureHud` component with the props block below, plus exported `LOADING_MESSAGES`, `MESSAGE_ROTATE_MS`, `FORMATS`, `FORMAT_COMMIT_MS`. Task 6 extends this same file; Task 8 mounts it.

```ts
interface Props {
  state: AppState;                       // "processing" | "success" | "rerendering" | "error"
  errorKind: CaptureErrorKind;
  contentType: ContentType;
  format: ExtractFormat;                 // committed format (spinner target while rerendering)
  anchor: { x: number; y: number };
  onFormatChange: (f: ExtractFormat) => void;
  onCustomSubmit: (hint: string) => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onEngage: () => void;
  onDismiss: () => void;
}
```

- [ ] **Step 1: Write the failing rendering tests** — create `src/tests/CaptureHud.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  CaptureHud,
  LOADING_MESSAGES,
  MESSAGE_ROTATE_MS,
} from "../components/CaptureHud";

const noop = () => {};
const baseProps = {
  state: "success" as const,
  errorKind: "generic" as const,
  contentType: "table" as const,
  format: "markdown" as const,
  anchor: { x: 20, y: 200 },
  onFormatChange: noop,
  onCustomSubmit: noop,
  onRetry: noop,
  onOpenSettings: noop,
  onEngage: noop,
  onDismiss: noop,
};

describe("CaptureHud rendering", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a rotating loading line while processing", () => {
    vi.useFakeTimers();
    render(<CaptureHud {...baseProps} state="processing" />);
    const first = screen.getByTestId("hud-message").textContent!;
    expect(LOADING_MESSAGES).toContain(first);
    act(() => {
      vi.advanceTimersByTime(MESSAGE_ROTATE_MS);
    });
    expect(screen.getByTestId("hud-message").textContent).not.toBe(first);
  });

  it("shows the copied pill with the detected content type", () => {
    render(<CaptureHud {...baseProps} />);
    expect(screen.getByText("Copied as table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Markdown" })).not.toBeInTheDocument();
  });

  it("reveals the chip row on hover and engages", () => {
    const onEngage = vi.fn();
    render(<CaptureHud {...baseProps} onEngage={onEngage} />);
    fireEvent.mouseEnter(screen.getByTestId("hud"));
    expect(onEngage).toHaveBeenCalled();
    for (const name of ["Markdown", "Table / CSV", "JSON", "Plain text", "Custom hint"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("clicking a chip commits the format immediately", () => {
    const onFormatChange = vi.fn();
    render(<CaptureHud {...baseProps} onFormatChange={onFormatChange} />);
    fireEvent.mouseEnter(screen.getByTestId("hud"));
    fireEvent.click(screen.getByRole("button", { name: "Table / CSV" }));
    expect(onFormatChange).toHaveBeenCalledWith("csv");
  });

  it("marks the committed chip as active while rerendering", () => {
    render(<CaptureHud {...baseProps} state="rerendering" format="csv" />);
    expect(screen.getByRole("button", { name: "Table / CSV" })).toHaveAttribute(
      "data-active",
      "true"
    );
  });

  it("generic errors offer a retry action", () => {
    const onRetry = vi.fn();
    render(<CaptureHud {...baseProps} state="error" onRetry={onRetry} />);
    expect(screen.getByText("Dam — couldn't read that")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("permission errors offer to open System Settings", () => {
    const onOpenSettings = vi.fn();
    render(
      <CaptureHud
        {...baseProps}
        state="error"
        errorKind="permission"
        onOpenSettings={onOpenSettings}
      />
    );
    expect(screen.getByText("Needs Screen Recording access")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open System Settings" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/tests/CaptureHud.test.tsx`
Expected: FAIL — cannot resolve `../components/CaptureHud`.

- [ ] **Step 3: Implement the component** — create `src/components/CaptureHud.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowRight,
  Braces,
  Check,
  FileText,
  Loader2,
  Lock,
  RefreshCw,
  Settings,
  Sparkles,
  Table,
  TriangleAlert,
} from "lucide-react";
import type { AppState, ContentType, ExtractFormat } from "../types";
import type { CaptureErrorKind } from "../hooks/useBeaver";

// On-brand loading copy (moved here from the retired CursorToast): a busy
// beaver gnawing your pixels into a tidy dam of data.
export const LOADING_MESSAGES = [
  "Chucking wood…", "Building the dam…", "What the dam…", "Gnawing through…",
  "Hauling logs…", "Packing it tight…", "Damming it up…", "Logging on…",
  "Dam near done…", "Busy as a beaver…", "Felling some trees…",
  "Stacking the sticks…", "Chewing the data…", "Sealing the leaks…",
  "Slapping some tails…", "Working the woodpile…", "Patching the dam…",
  "Whittling it down…", "Mudding the cracks…", "Hold my dam…",
  "Gnaw or never…", "Timber incoming…", "Stockpiling lumber…",
  "Dam, that's a lot…", "Rerouting the river…", "Building back beaver…",
  "Wood you wait a sec…", "Splinter by splinter…", "Chiselling the bark…",
  "Flooding the zone…", "Tail-slapping the bugs…", "Lodging a complaint…",
  "Branching out…", "Knee-deep in twigs…", "Damn fine work…",
  "Eager beaver mode…", "Plugging the gaps…", "Sawing it off…",
  "Gnashing the pixels…", "One more log…",
];
export const MESSAGE_ROTATE_MS = 1200;

// A chip switch fires a model call (seconds, not free), so Tab-lap movement
// only commits after the highlight settles. Clicks and 1–4 commit at once.
export const FORMAT_COMMIT_MS = 400;

export const FORMATS: { key: ExtractFormat; label: string; Icon: typeof Table }[] = [
  { key: "markdown", label: "Markdown", Icon: FileText },
  { key: "csv", label: "Table / CSV", Icon: Table },
  { key: "json", label: "JSON", Icon: Braces },
  { key: "plain", label: "Plain text", Icon: AlignLeft },
];

const TYPE_LABELS: Record<ContentType, string> = {
  table: "table",
  code: "code",
  list: "list",
  prose: "text",
  mixed: "content",
};

interface Props {
  state: AppState;
  errorKind: CaptureErrorKind;
  contentType: ContentType;
  format: ExtractFormat;
  anchor: { x: number; y: number };
  onFormatChange: (f: ExtractFormat) => void;
  onCustomSubmit: (hint: string) => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onEngage: () => void;
  onDismiss: () => void;
}

export function CaptureHud({
  state,
  errorKind,
  contentType,
  format,
  anchor,
  onFormatChange,
  onCustomSubmit,
  onRetry,
  onOpenSettings,
  onEngage,
  onDismiss,
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [pending, setPending] = useState<ExtractFormat>(format);
  const [msgIndex, setMsgIndex] = useState(
    () => Math.floor(Math.random() * LOADING_MESSAGES.length)
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setPending(format), [format]);

  useEffect(() => {
    if (state !== "processing") return;
    const id = setInterval(
      () => setMsgIndex(i => (i + 1) % LOADING_MESSAGES.length),
      MESSAGE_ROTATE_MS
    );
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (inputOpen) inputRef.current?.focus();
  }, [inputOpen]);

  const reveal = useCallback(() => {
    onEngage();
    setRevealed(true);
  }, [onEngage]);

  const selectFormat = useCallback(
    (key: ExtractFormat, immediate: boolean) => {
      setPending(key);
      if (commitRef.current) clearTimeout(commitRef.current);
      const commit = () => {
        if (key !== format) onFormatChange(key);
      };
      if (immediate) commit();
      else commitRef.current = setTimeout(commit, FORMAT_COMMIT_MS);
    },
    [format, onFormatChange]
  );

  const openInput = useCallback(() => {
    reveal();
    setInputOpen(true);
  }, [reveal]);

  const closeInput = useCallback(() => {
    setInputOpen(false);
    setHint("");
  }, []);

  const submitHint = useCallback(() => {
    const h = hint.trim();
    if (!h) return;
    closeInput();
    onCustomSubmit(h);
  }, [hint, closeInput, onCustomSubmit]);

  useEffect(() => {
    if (state !== "success" && state !== "rerendering" && state !== "error") return;
    const onKey = (e: KeyboardEvent) => {
      if (state === "error") {
        if (e.key === "Enter") {
          (errorKind === "permission" ? onOpenSettings : onRetry)();
        } else if (e.key === "Escape") {
          onDismiss();
        }
        return;
      }
      if (inputOpen) return;
      if (e.key === "Tab") {
        e.preventDefault();
        if (!revealed) {
          reveal();
          return;
        }
        const idx = FORMATS.findIndex(f => f.key === pending);
        if (e.shiftKey) {
          if (idx === 0) openInput();
          else selectFormat(FORMATS[idx - 1].key, false);
        } else {
          if (idx === FORMATS.length - 1) openInput();
          else selectFormat(FORMATS[idx + 1].key, false);
        }
      } else if (e.key === "/") {
        e.preventDefault();
        openInput();
      } else if (e.key >= "1" && e.key <= "4") {
        reveal();
        selectFormat(FORMATS[Number(e.key) - 1].key, true);
      } else if (e.key === "Escape") {
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, errorKind, revealed, inputOpen, pending, reveal, openInput, selectFormat, onDismiss, onOpenSettings, onRetry]);

  if (state === "idle") return null;

  const pill =
    "flex items-center rounded-full border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-md";

  return (
    <div
      data-testid="hud"
      className="fixed z-50"
      style={{ left: anchor.x, top: anchor.y }}
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={() => {
        if (state === "success" || state === "rerendering") reveal();
      }}
    >
      {state === "processing" && (
        <div className={`${pill} gap-2 px-3 py-2 text-[13px] font-medium text-white`}>
          <Loader2 className="size-4 animate-spin text-primary" />
          <span data-testid="hud-message" className="whitespace-nowrap">
            {LOADING_MESSAGES[msgIndex]}
          </span>
        </div>
      )}

      {state === "error" && (
        <div className={`${pill} gap-2 py-1.5 pl-3 pr-1.5 text-[13px] font-medium text-white`}>
          {errorKind === "permission" ? (
            <Lock className="size-4 text-red-300" />
          ) : (
            <TriangleAlert className="size-4 text-red-300" />
          )}
          <span className="whitespace-nowrap">
            {errorKind === "permission"
              ? "Needs Screen Recording access"
              : "Dam — couldn't read that"}
          </span>
          <button
            aria-label={errorKind === "permission" ? "Open System Settings" : "Retry"}
            onClick={errorKind === "permission" ? onOpenSettings : onRetry}
            className="flex size-6 items-center justify-center rounded-full bg-primary text-zinc-900"
          >
            {errorKind === "permission" ? (
              <Settings className="size-3.5" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </button>
        </div>
      )}

      {(state === "success" || state === "rerendering") && !revealed && (
        <div className={`${pill} gap-2 px-3 py-2 text-[13px] font-medium text-white`}>
          <Check className="size-4 text-primary" strokeWidth={3} />
          <span className="whitespace-nowrap">
            Copied as {TYPE_LABELS[contentType]}
          </span>
        </div>
      )}

      {(state === "success" || state === "rerendering") && revealed && (
        <div className={`${pill} gap-0.5 px-1.5 py-1`}>
          {!inputOpen && (
            <>
              {FORMATS.map(({ key, label, Icon }) => {
                const active = key === pending;
                return (
                  <button
                    key={key}
                    aria-label={label}
                    data-active={active}
                    onClick={() => selectFormat(key, true)}
                    className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors ${
                      active ? "bg-primary text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {state === "rerendering" && key === format ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Icon className="size-4" />
                    )}
                  </button>
                );
              })}
              <span className="mx-1 h-3.5 w-px bg-white/15" />
            </>
          )}
          {inputOpen && (
            <input
              ref={inputRef}
              aria-label="Formatting hint"
              value={hint}
              placeholder="headers are dates"
              onChange={e => setHint(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Enter") submitHint();
                else if (e.key === "Escape") closeInput();
                else if (e.key === "Tab") {
                  e.preventDefault();
                  closeInput();
                  selectFormat(e.shiftKey ? "plain" : "markdown", false);
                }
              }}
              className="hud-input mx-1 h-6 bg-transparent text-[12.5px] text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          )}
          <button
            aria-label={inputOpen ? "Run" : "Custom hint"}
            onClick={() => {
              if (!inputOpen) openInput();
              else if (hint.trim()) submitHint();
              else closeInput();
            }}
            className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors ${
              inputOpen ? "bg-primary text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {inputOpen ? <ArrowRight className="size-4" /> : <Sparkles className="size-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the input-grow animation** — append to `src/index.css` (alongside the existing `beaver-*` keyframes):

```css
.hud-input {
  width: 0;
  animation: hud-input-grow 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes hud-input-grow {
  to { width: 170px; }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:run src/tests/CaptureHud.test.tsx`
Expected: 7 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/CaptureHud.tsx src/tests/CaptureHud.test.tsx src/index.css
git commit -m "feat: anchored capture HUD with format chips, input, and error states"
```

---

### Task 6: `CaptureHud` — Tab lap keyboard model

**Files:**
- Modify: `src/components/CaptureHud.tsx` (behavior already scaffolded in Task 5 — this task locks it in with tests and fixes what fails)
- Test: `src/tests/CaptureHud.test.tsx` (append)

**Interfaces:**
- Consumes/Produces: unchanged from Task 5. The lap contract: `Tab` (unrevealed) reveals; `Tab` (revealed) advances the pending highlight with a `FORMAT_COMMIT_MS` debounce; `Tab` past the last format opens the input; `Tab` inside the input closes it and wraps to markdown (Shift+Tab: plain); `1–4` commit immediately; `/` opens the input; `Escape` backs out one level (input → chips → dismissed); in error state `Enter` triggers the action chip.

- [ ] **Step 1: Append the failing keyboard tests** to `src/tests/CaptureHud.test.tsx`:

```tsx
import { FORMAT_COMMIT_MS } from "../components/CaptureHud";

describe("CaptureHud keyboard lap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const tab = (shift = false) =>
    fireEvent.keyDown(window, { key: "Tab", shiftKey: shift });

  it("first Tab reveals the chips without changing format", () => {
    const onFormatChange = vi.fn();
    render(<CaptureHud {...baseProps} onFormatChange={onFormatChange} />);
    tab();
    expect(screen.getByRole("button", { name: "Markdown" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(FORMAT_COMMIT_MS));
    expect(onFormatChange).not.toHaveBeenCalled();
  });

  it("lapping with Tab debounces to a single commit of the final format", () => {
    const onFormatChange = vi.fn();
    render(<CaptureHud {...baseProps} onFormatChange={onFormatChange} />);
    tab(); // reveal
    tab(); // markdown -> csv
    tab(); // csv -> json
    expect(onFormatChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(FORMAT_COMMIT_MS));
    expect(onFormatChange).toHaveBeenCalledTimes(1);
    expect(onFormatChange).toHaveBeenCalledWith("json");
  });

  it("Tab past the last format opens the input; Tab again closes and wraps", () => {
    render(<CaptureHud {...baseProps} format="plain" />);
    tab(); // reveal (pending = plain)
    tab(); // plain -> input opens
    const input = screen.getByRole("textbox", { name: "Formatting hint" });
    expect(input).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(
      screen.queryByRole("textbox", { name: "Formatting hint" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute(
      "data-active",
      "true"
    );
  });

  it("digit keys commit immediately", () => {
    const onFormatChange = vi.fn();
    render(<CaptureHud {...baseProps} onFormatChange={onFormatChange} />);
    fireEvent.keyDown(window, { key: "2" });
    expect(onFormatChange).toHaveBeenCalledWith("csv");
  });

  it("slash opens the input and Enter submits the hint", () => {
    const onCustomSubmit = vi.fn();
    render(<CaptureHud {...baseProps} onCustomSubmit={onCustomSubmit} />);
    fireEvent.keyDown(window, { key: "/" });
    const input = screen.getByRole("textbox", { name: "Formatting hint" });
    fireEvent.change(input, { target: { value: "output Swedish" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCustomSubmit).toHaveBeenCalledWith("output Swedish");
  });

  it("Escape backs out one level: input, then dismissed", () => {
    const onDismiss = vi.fn();
    render(<CaptureHud {...baseProps} onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: "/" });
    const input = screen.getByRole("textbox", { name: "Formatting hint" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      screen.queryByRole("textbox", { name: "Formatting hint" })
    ).not.toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Enter in the error state triggers the action", () => {
    const onRetry = vi.fn();
    render(<CaptureHud {...baseProps} state="error" onRetry={onRetry} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onRetry).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test:run src/tests/CaptureHud.test.tsx`
Expected: mostly PASS from Task 5's implementation; fix any failures **in the component, not the tests** — the tests are the contract. Likely trouble spots: the digit path must reveal *and* commit; Tab-out of the input must land the pending highlight on markdown/plain.

- [ ] **Step 3: Run the full suite**

Run: `pnpm test:run`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/CaptureHud.tsx src/tests/CaptureHud.test.tsx
git commit -m "test: lock in the HUD tab-lap keyboard contract"
```

---

### Task 7: `CaptureOverlay` frozen mode

**Files:**
- Modify: `src/components/CaptureOverlay.tsx`
- Test: `src/tests/CaptureOverlay.test.tsx` (append)

**Interfaces:**
- Consumes: existing `Rect`.
- Produces: optional prop `frozen?: Rect | null`. When set, the overlay renders only the selection ring + punched-out dim (pointer-events-none, no listeners, no crosshair, no hint pill). Task 8 relies on `frozen`.

- [ ] **Step 1: Append the failing tests** to `src/tests/CaptureOverlay.test.tsx` (this file currently tests only `normalizeRect`; add component tests):

```tsx
import { render, screen } from "@testing-library/react";
import { CaptureOverlay } from "../components/CaptureOverlay";

describe("CaptureOverlay frozen mode", () => {
  const sel = { x: 10, y: 20, width: 100, height: 80 };

  it("renders only the selection ring when frozen", () => {
    render(<CaptureOverlay frozen={sel} onCapture={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId("frozen-selection")).toBeInTheDocument();
    expect(screen.queryByText(/Drag to capture/)).not.toBeInTheDocument();
  });

  it("frozen overlay ignores pointer events", () => {
    render(<CaptureOverlay frozen={sel} onCapture={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId("frozen-root").className).toContain("pointer-events-none");
  });
});
```

(Also change the test file's first import line to include the React testing utilities if not present: `import { describe, it, expect } from "vitest";` stays.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/tests/CaptureOverlay.test.tsx`
Expected: FAIL — `frozen` prop unknown / testids missing.

- [ ] **Step 3: Implement** — in `src/components/CaptureOverlay.tsx`, extend the props and add an early return at the top of the component body:

```tsx
interface Props {
  onCapture: (region: Rect, origin: Point) => void;
  onCancel: () => void;
  frozen?: Rect | null;
}

export function CaptureOverlay({ onCapture, onCancel, frozen }: Props) {
  if (frozen) {
    return (
      <div
        data-testid="frozen-root"
        className="pointer-events-none fixed inset-0 select-none overflow-hidden"
      >
        <div
          data-testid="frozen-selection"
          className="absolute rounded-[3px] ring-2 ring-primary"
          style={{
            left: frozen.x,
            top: frozen.y,
            width: frozen.width,
            height: frozen.height,
            boxShadow: "0 0 0 100vmax rgba(0,0,0,0.45)",
          }}
        />
      </div>
    );
  }
  // ...existing hooks and drag logic unchanged below
```

**Note:** React hooks must not sit below a conditional return — move the `if (frozen)` block *after* the existing `useState`/`useEffect`/`useCallback` declarations (hooks first, then the early return, then the interactive JSX). The hooks run harmlessly in frozen mode.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run src/tests/CaptureOverlay.test.tsx`
Expected: all PASS (3 normalizeRect + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/CaptureOverlay.tsx src/tests/CaptureOverlay.test.tsx
git commit -m "feat: frozen selection mode so the overlay anchors the HUD"
```

---

### Task 8: App wiring — mount the HUD, retire CursorToast

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/components/CursorToast.tsx`, `src/tests/CursorToast.test.tsx`
- Modify: `src/tests/App.test.tsx`

**Interfaces:**
- Consumes: everything above — `useBeaver` (Task 4), `CaptureHud` (Tasks 5–6), `frozen` overlay (Task 7), `hudPosition` (Task 3), existing Tauri command `open_screen_recording_settings`.
- Produces: the shipped capture flow. Window rules: `setIgnoreCursorEvents(true)` when processing starts (screen stays usable); `setIgnoreCursorEvents(false)` when the state leaves `processing` (HUD becomes interactive); any mousedown outside the HUD dismisses (the HUD stops propagation, from Task 5); dismiss closes the window via the hook's `onComplete`.

- [ ] **Step 1: Rewrite the "App capture flow" tests** — in `src/tests/App.test.tsx`, replace the `useBeaver` mock, the `CursorToast` mock, and the whole `describe("App capture flow", ...)` block:

Replace the `beaverState`/`useBeaver` mock setup with:

```tsx
const { dismissMock } = vi.hoisted(() => ({ dismissMock: vi.fn() }));

vi.mock("../hooks/useBeaver", () => ({
  useBeaver: () => ({
    state: beaverState.value,
    errorKind: "generic",
    format: "markdown",
    contentType: "prose",
    runCapture: runCaptureMock,
    reExtract: vi.fn(),
    retry: vi.fn(),
    engage: vi.fn(),
    dismiss: dismissMock,
  }),
}));
```

Replace the `CursorToast` mock with:

```tsx
vi.mock("../components/CaptureHud", () => ({
  CaptureHud: ({ state }: { state: string }) => <div>capture-hud:{state}</div>,
}));
```

Update the `CaptureOverlay` mock to reflect the frozen prop:

```tsx
vi.mock("../components/CaptureOverlay", () => ({
  CaptureOverlay: ({
    onCapture,
    frozen,
  }: {
    onCapture: (r: unknown, p: unknown) => void;
    frozen?: unknown;
  }) =>
    frozen ? (
      <div>frozen-overlay</div>
    ) : (
      <button
        onClick={() =>
          onCapture({ x: 1, y: 1, width: 20, height: 20 }, { x: 7, y: 9 })
        }
      >
        do-capture
      </button>
    ),
}));
```

Replace the capture-flow describe block with:

```tsx
describe("App capture flow", () => {
  beforeEach(() => {
    windowLabel.value = "capture-overlay";
    beaverState.value = "idle";
    runCaptureMock.mockReset();
    dismissMock.mockReset();
    ignoreCursorMock.mockClear();
    window.history.pushState({}, "", "/capture");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("shows the capture overlay before a selection is made", () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: /do-capture/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/capture-hud/i)).not.toBeInTheDocument();
  });

  it("freezes the selection and mounts the HUD after a capture", () => {
    beaverState.value = "processing";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));
    expect(runCaptureMock).toHaveBeenCalledWith({
      x: 1,
      y: 1,
      width: 20,
      height: 20,
    });
    expect(screen.getByText("frozen-overlay")).toBeInTheDocument();
    expect(screen.getByText("capture-hud:processing")).toBeInTheDocument();
  });

  it("goes click-through while processing", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));
    expect(ignoreCursorMock).toHaveBeenCalledWith(true);
  });

  it("becomes interactive again when the result arrives", () => {
    beaverState.value = "success";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));
    expect(ignoreCursorMock).toHaveBeenCalledWith(false);
  });

  it("clicking outside the HUD dismisses", () => {
    beaverState.value = "success";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /do-capture/i }));
    fireEvent.mouseDown(screen.getByTestId("click-away"));
    expect(dismissMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/tests/App.test.tsx`
Expected: FAIL — App still renders `CursorToast`, no frozen overlay, no click-away element.

- [ ] **Step 3: Rewrite `src/App.tsx`:**

```tsx
import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CaptureOverlay, type Rect } from "./components/CaptureOverlay";
import { CaptureHud } from "./components/CaptureHud";
import { hudPosition } from "./lib/hudPosition";
import { selectView } from "./lib/routing";
import { useBeaver } from "./hooks/useBeaver";
import { useCaptures } from "./hooks/useCaptures";

// The capture overlay opens on a global shortcut and must paint instantly, so
// it stays eager. The popover and onboarding load only in their own windows.
const TrayPopover = lazy(() =>
  import("./components/TrayPopover").then(m => ({ default: m.TrayPopover }))
);
const Onboarding = lazy(() =>
  import("./components/Onboarding").then(m => ({ default: m.Onboarding }))
);

export default function App() {
  const route = window.location.pathname;
  const { saveCapture } = useCaptures({ autoLoad: false });
  const [sel, setSel] = useState<Rect | null>(null);

  const closeWindow = useCallback(() => {
    getCurrentWindow().close().catch(() => {});
  }, []);

  const {
    state,
    errorKind,
    format,
    contentType,
    runCapture,
    reExtract,
    retry,
    engage,
    dismiss,
  } = useBeaver(saveCapture, closeWindow);

  const handleCapture = useCallback(
    (region: Rect) => {
      setSel(region);
      getCurrentWindow().setIgnoreCursorEvents(true).catch(() => {});
      runCapture(region);
    },
    [runCapture]
  );

  // The overlay is click-through while processing (so the screen never feels
  // frozen) and interactive once the HUD has something to offer.
  useEffect(() => {
    if (!sel || state === "processing" || state === "idle") return;
    getCurrentWindow().setIgnoreCursorEvents(false).catch(() => {});
  }, [sel, state]);

  const handleCancel = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  const openSettings = useCallback(() => {
    invoke("open_screen_recording_settings").catch(() => {});
    dismiss();
  }, [dismiss]);

  const view = selectView(route, getCurrentWindow().label);

  if (view === "capture") {
    if (!sel) {
      return <CaptureOverlay onCapture={handleCapture} onCancel={handleCancel} />;
    }
    return (
      <div
        data-testid="click-away"
        className="fixed inset-0"
        onMouseDown={() => dismiss()}
      >
        <CaptureOverlay frozen={sel} onCapture={() => {}} onCancel={() => {}} />
        <CaptureHud
          state={state}
          errorKind={errorKind}
          contentType={contentType}
          format={format}
          anchor={hudPosition(sel, {
            width: window.innerWidth,
            height: window.innerHeight,
          })}
          onFormatChange={f => reExtract(f)}
          onCustomSubmit={hint => reExtract(format, hint)}
          onRetry={retry}
          onOpenSettings={openSettings}
          onEngage={engage}
          onDismiss={dismiss}
        />
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      {view === "onboarding" ? <Onboarding /> : <TrayPopover />}
    </Suspense>
  );
}
```

- [ ] **Step 4: Delete the retired component**

```bash
git rm src/components/CursorToast.tsx src/tests/CursorToast.test.tsx
```

Then verify nothing else references it: `grep -rn "CursorToast" src/` — expected: no matches.

- [ ] **Step 5: Run the full suite and the build**

Run: `pnpm test:run && pnpm build`
Expected: all tests PASS; TypeScript build clean.

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "feat: wire the anchored HUD into the capture flow, retire CursorToast"
```

---

### Task 9: Full verification + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run every suite**

```bash
pnpm test:run          # expected: all pass
cd src-tauri && cargo test && cd ..   # expected: all pass
pnpm build             # expected: clean type-check + bundle
```

- [ ] **Step 2: Manual verification on Apple Silicon** (`pnpm tauri dev`, then for each item check the behavior):

1. `Cmd+Shift+D`, drag over a table → selection stays visible, anchored pill shows rotating beaver lines, resolves to `Copied as table`, auto-fades ~1.5 s, window closes, clipboard has Markdown.
2. Capture again, hover the pill before it fades → chips appear; click the CSV chip → spinner in chip, clipboard becomes CSV.
3. Keyboard only: capture, `Tab` (reveals) → `Tab`×3 (lap to plain, one commit after the pause) → `Tab` (input opens) → type "output Swedish", `Enter` → re-runs, pill returns to `Copied as …`.
4. `/` opens the input directly; `Esc` closes input; `Esc` again closes the window. Click anywhere outside the HUD → window closes.
5. Selection near the bottom edge → HUD flips above the selection.
6. Quit the MLX server (`pkill -f mlx_server`) mid-capture → error pill with Retry chip; Retry after restarting works.
7. Revoke Screen Recording permission → lock pill; its chip opens System Settings.

- [ ] **Step 3: Update `CHANGELOG.md`** under an `## Unreleased` heading (create it above the newest release entry if absent):

```markdown
## Unreleased

### Added
- Anchored capture HUD: the result pill now docks to the selection with
  format chips (Markdown / Table-CSV / JSON / plain), a custom formatting
  hint, a full Tab keyboard lap, and in-place retry for errors.
- `re_extract` command re-runs the last capture with a new format or hint
  without re-shooting the screen.

### Changed
- The cursor-following toast is retired in favor of the anchored HUD.
- Re-rendered formats update the clipboard; history keeps the first
  extraction of each capture.
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for the anchored capture HUD"
```

---

## Self-Review Notes

- **Spec coverage:** roadmap HUD spec → Tasks 5–6 (pill states, chips, horizontal input, Tab lap, Esc levels); anchored positioning + flip → Task 3; re-render without re-shooting → Task 2; retry same region → Task 4 (`retry`); permission settings chip → Tasks 5/8; processing beaver lines → Task 5; format plumbing → Tasks 1–2. Engine indicator (🔒/☁️) is explicitly Phase 2 (BYO cloud) — out of scope here per roadmap.
- **Known simplifications (deliberate):** re-renders don't update the history row; Tab-lap commits are debounced (400 ms) because chip switches cost a model call — both recorded in the File Structure note and CHANGELOG.
- **Type consistency check:** `ExtractFormat` string union (TS) ↔ serde lowercase enum (Rust) ↔ `invoke` arg keys `region/format/hint` — verified consistent across Tasks 1, 2, 4, 8.
