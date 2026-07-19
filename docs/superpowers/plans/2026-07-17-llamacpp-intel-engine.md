# llama.cpp Intel Mac Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beaver gets a second local vision engine — llama.cpp's `llama-server`, running MiniCPM-V 2.6 — compiled into Intel Mac builds in place of MLX, with zero Python and zero frontend changes.

**Architecture:** A compile-time `#[cfg(target_arch)]` swap in `lib.rs` aliases either `mlx` (aarch64) or the new `llamacpp` (x86_64) module to a common `engine` name; both expose an identical `health`/`extract_from_image`/`HealthStatus`/`ServerStatus` surface, enforced by the compiler. `server.rs` gains an x86_64 setup path that downloads the GGUF model directly via `reqwest` and spawns the bundled `llama-server` binary, reusing the existing setup-phase/health-poll machinery in `lib.rs` unchanged.

**Tech Stack:** llama.cpp `llama-server` (pinned release `b10061`), MiniCPM-V 2.6 GGUF (Q4_K_M) + mmproj from `openbmb/MiniCPM-V-2_6-gguf`, `reqwest` (already a dependency) for both the model download and the OpenAI-compatible chat-completions client, GitHub Actions `macos-15-intel` runner.

## Global Constraints

- **No new Cargo or npm dependencies.** `reqwest::Response::chunk()` streams a download without the `stream` feature; `tokio`'s existing `"full"` feature already provides `tokio::fs` + `#[tokio::test]`. If a task step seems to need a new dependency, stop and re-read this constraint — it means there's a simpler way.
- **No Python anywhere in the llama.cpp engine's path** — not the app, not its bundled resources. Non-negotiable per the design spec.
- **Frontend: zero files touched.** The `{phase, progress}` wire shape of the `mlx_status` command stays byte-identical on both architectures.
- **Keep existing names as-is:** `MlxServer` struct, `SetupPhase`/`ServerStatus` enums (per-module), `mlx_status` command. The one deliberate rename: the setup log filename, `mlx-server.log` → `engine-server.log`.
- **Pinned llama.cpp release: `b10061`** (https://github.com/ggml-org/llama.cpp/releases/tag/b10061), asset `llama-b10061-bin-macos-x64.tar.gz`. Re-verify this is still the intended pin before Task 6 if a lot of time has passed since this plan was written — llama.cpp cuts releases very frequently.
- **Pinned model: `openbmb/MiniCPM-V-2_6-gguf`**, files `ggml-model-Q4_K_M.gguf` (4,681,089,344 bytes) + `mmproj-model-f16.gguf` (1,044,425,152 bytes). Both verified to exist and resolve at plan-writing time. Documented fallback if Task 1's validation fails: `bartowski/Qwen2-VL-7B-Instruct-GGUF`, files `Qwen2-VL-7B-Instruct-Q4_K_M.gguf` (4,683,072,672 bytes) + `mmproj-Qwen2-VL-7B-Instruct-f16.gguf` (1,352,635,904 bytes) — also verified to exist and resolve at plan-writing time. The swap only touches the four constants in Task 4 Step 4.
- **CI runner: `macos-15-intel`.** `macos-13` is fully retired (removed December 2025); `macos-15-intel` is the current GitHub-hosted Intel label as of 2026-07-17 and is supported until at least August 2027.
- **Local x86_64 verification works on an Apple Silicon dev machine via Rosetta 2** — confirmed during planning: `rustup target add x86_64-apple-darwin` (one-time), then `cargo test --target x86_64-apple-darwin` compiles and runs the Intel-only code paths, including spawning the real (x86_64) `llama-server` binary, transparently under Rosetta. The CI job on real Intel hardware is still the authoritative gate.
- **Out of scope — do not add:** x86_64 DMG publishing or a `darwin-x86_64` updater entry, a Settings/engine-picker UI, a universal single DMG, GPU acceleration on Intel (CPU-only is the MVP).
- **Tests:** `cd src-tauri && cargo test` (default target) and `cargo test --target x86_64-apple-darwin` (Intel path) after every task. Commit after every task, conventional commits, trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `src-tauri/tests/fixtures/table-sample.png`, `code-sample.png` (new) | Synthetic table/code screenshots for model validation and the CI integration test |
| `src-tauri/src/prompts.rs` (new) | `ExtractFormat`, `prompt_for`, format prompt constants — arch-neutral, moved out of `mlx.rs` |
| `src-tauri/src/mlx.rs` (modified) | Gated to `aarch64`; format-prompt items removed (now in `prompts.rs`) |
| `src-tauri/src/llamacpp.rs` (new) | `x86_64`-only engine: `health`/`extract_from_image` against `llama-server`'s HTTP API |
| `src-tauri/src/server.rs` (modified) | Arch-gated `env_is_ready`/`build_env`/`spawn_server`; new `download_progress` field; shared `open_server_log` helper; engine-neutral log filename |
| `src-tauri/src/lib.rs` (modified) | Compile-time `engine` alias; command bodies call `engine::`/`prompts::` instead of `mlx::` directly |
| `src-tauri/resources/llama/` (new, 10 binary files) | Bundled `llama-server` + its 9 `@rpath` dylib dependencies |
| `src-tauri/tauri.conf.json` (modified) | `bundle.resources` gains `resources/llama` |
| `.github/workflows/test-llamacpp-intel.yml` (new) | Native Intel CI: build, unit tests, real end-to-end extraction |
| `.gitignore` (modified) | Ignore the CI's local model-cache scratch dir |
| `README.md` (modified) | Prerequisites note: Intel Mac is now buildable from source |

---

### Task 1: Test fixtures and model-choice validation spike

**Files:**
- Create: `src-tauri/tests/fixtures/table-sample.png`, `src-tauri/tests/fixtures/code-sample.png`

**Interfaces:**
- Produces: the two fixture images every later task (the manual validation below, and Task 3's ignored end-to-end test) reads from `src-tauri/tests/fixtures/`.

This task has no application code — it's the spec's required gate ("validate the model before building on top of it") plus the fixture assets the rest of the plan depends on.

- [ ] **Step 1: Generate and commit the fixture images**

```bash
mkdir -p src-tauri/tests/fixtures
uv run --no-project --with pillow -- python3 <<'EOF'
from PIL import Image, ImageDraw, ImageFont

mono = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 22)

cols = ["Item", "Qty", "Price"]
rows = [
    ["Widget", "12", "$4.50"],
    ["Gadget", "3", "$19.99"],
    ["Bolt", "144", "$0.05"],
]
col_w = [220, 100, 120]
row_h = 44
W = sum(col_w) + 40
H = row_h * (len(rows) + 1) + 40
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)
x0, y0 = 20, 20
x = x0
for i, c in enumerate(cols):
    d.text((x + 10, y0 + 10), c, font=mono, fill="black")
    x += col_w[i]
for r in range(len(rows) + 2):
    y = y0 + r * row_h
    d.line([(x0, y), (x0 + sum(col_w), y)], fill="black", width=1)
x = x0
for i in range(len(cols) + 1):
    d.line([(x, y0), (x, y0 + row_h * (len(rows) + 1))], fill="black", width=1)
    if i < len(col_w):
        x += col_w[i]
for ri, row in enumerate(rows):
    x = x0
    y = y0 + row_h * (ri + 1)
    for ci, cell in enumerate(row):
        d.text((x + 10, y + 10), cell, font=mono, fill="black")
        x += col_w[ci]
img.save("src-tauri/tests/fixtures/table-sample.png")

code_lines = [
    "def fibonacci(n):",
    "    if n <= 1:",
    "        return n",
    "    a, b = 0, 1",
    "    for _ in range(n - 1):",
    "        a, b = b, a + b",
    "    return b",
]
line_h = 30
W2 = 640
H2 = line_h * len(code_lines) + 40
img2 = Image.new("RGB", (W2, H2), (30, 30, 30))
d2 = ImageDraw.Draw(img2)
for i, line in enumerate(code_lines):
    d2.text((20, 20 + i * line_h), line, font=mono, fill=(220, 220, 220))
img2.save("src-tauri/tests/fixtures/code-sample.png")
EOF
```

Verify: `file src-tauri/tests/fixtures/*.png` reports two valid PNG images.

- [ ] **Step 2: Manually validate MiniCPM-V 2.6 against the fixtures**

This step doesn't produce committed code — it's the go/no-go gate on the model pick before any engine code is written. Run it once, on any Mac (Rosetta makes the binary runnable on Apple Silicon too):

```bash
SCRATCH=$(mktemp -d)
curl -sL -o "$SCRATCH/llama.tar.gz" \
  "https://github.com/ggml-org/llama.cpp/releases/download/b10061/llama-b10061-bin-macos-x64.tar.gz"
tar -xzf "$SCRATCH/llama.tar.gz" -C "$SCRATCH"
curl -sL -o "$SCRATCH/model.gguf" \
  "https://huggingface.co/openbmb/MiniCPM-V-2_6-gguf/resolve/main/ggml-model-Q4_K_M.gguf"
curl -sL -o "$SCRATCH/mmproj.gguf" \
  "https://huggingface.co/openbmb/MiniCPM-V-2_6-gguf/resolve/main/mmproj-model-f16.gguf"

arch -x86_64 "$SCRATCH"/llama-b10061/llama-server \
  -m "$SCRATCH/model.gguf" --mmproj "$SCRATCH/mmproj.gguf" \
  --host 127.0.0.1 --port 8712 &
SERVER_PID=$!

# Wait for readiness (model load is slow, especially under Rosetta/CPU-only).
until curl -sf http://127.0.0.1:8712/health >/dev/null; do sleep 2; done

for f in table-sample code-sample; do
  B64=$(base64 -i "src-tauri/tests/fixtures/$f.png")
  curl -s http://127.0.0.1:8712/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"local\",\"max_tokens\":1024,\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"image_url\",\"image_url\":{\"url\":\"data:image/png;base64,$B64\"}},{\"type\":\"text\",\"text\":\"Extract all data visible in this image. Return as Markdown only. Preserve structure exactly: tables as Markdown tables, lists as Markdown lists, code in fenced code blocks with language hints. Output only the extracted content — no commentary or explanation.\"}]}]}" \
    | tee "$SCRATCH/$f-result.json"
  echo
done

kill $SERVER_PID
```

**Pass bar:** the `table-sample` result contains a Markdown table with a header separator row (`| --- | --- | --- |`-shaped) and the three correct rows (Widget/12/$4.50, Gadget/3/$19.99, Bolt/144/$0.05); the `code-sample` result contains a fenced code block preserving the `def fibonacci(n):` structure and 4-space indentation. Minor wording differences are fine — structural fidelity is what's being validated (this mirrors Beaver's own hero use case: "structure survives").

**If it fails** (garbled table, lost indentation, or the model won't load in reasonable time): swap to `bartowski/Qwen2-VL-7B-Instruct-GGUF` and repeat this step before continuing — nothing in Task 1's Step 1 or any later task depends on which model wins; only the four constants in Task 4 (`GGUF_MODEL_URL`, `MMPROJ_URL`, and the two filenames) change.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tests/fixtures/table-sample.png src-tauri/tests/fixtures/code-sample.png
git commit -m "test: add table/code fixture images for llama.cpp engine validation"
```

---

### Task 2: Extract `prompts.rs`

**Files:**
- Create: `src-tauri/src/prompts.rs`
- Modify: `src-tauri/src/mlx.rs` (remove the moved items and their tests)
- Modify: `src-tauri/src/lib.rs` (register the new module)

**Interfaces:**
- Produces: `prompts::ExtractFormat` (enum: `Markdown`/`Csv`/`Json`/`Plain`, `Deserialize`, lowercase-tagged) and `prompts::prompt_for(format: ExtractFormat, hint: Option<&str>) -> String` — arch-neutral, consumed directly by `lib.rs`'s command bodies (Task 5) and by `mlx.rs`/`llamacpp.rs`'s callers. Neither engine module needs to import this itself; only `lib.rs` calls it before handing a built prompt string to `engine::extract_from_image`.

This is a pure, behavior-preserving move — the "test" here is that every test that passed before still passes after, just relocated.

- [ ] **Step 1: Create `prompts.rs`** with the exact content moved from `mlx.rs` (lines 3–45 of the current file: the constants, the enum, and `prompt_for`), plus its five existing tests:

```rust
pub const EXTRACTION_PROMPT: &str =
    "Extract all data visible in this image. Return as Markdown only. \
     Preserve structure exactly: tables as Markdown tables, lists as Markdown lists, \
     code in fenced code blocks with language hints. \
     Output only the extracted content — no commentary or explanation.";

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

#[cfg(test)]
mod tests {
    use super::*;

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
}
```

- [ ] **Step 2: Remove the moved items from `mlx.rs`** — delete this block (everything between the `use` line and `api_url`):

```rust
pub const EXTRACTION_PROMPT: &str =
```
... through ...
```rust
pub fn api_url(port: u16, path: &str) -> String {
```
Delete from `pub const EXTRACTION_PROMPT` up to (but not including) `pub fn api_url`. `mlx.rs` now starts with:

```rust
use std::time::Duration;

pub fn api_url(port: u16, path: &str) -> String {
```

Then delete the five moved tests from `mlx.rs`'s `#[cfg(test)] mod tests` block: `prompt_for_markdown_without_hint_is_the_default_prompt`, `prompt_for_each_format_names_its_output_shape`, `prompt_for_appends_a_trimmed_hint`, `prompt_for_ignores_blank_hints`, `extract_format_deserializes_from_lowercase_json`. `mlx.rs`'s test module keeps exactly: `api_url_builds_with_port`, `health_deserializes_ready_ignoring_extra_fields`, `health_deserializes_downloading`, `health_reads_download_progress`, `health_progress_defaults_to_none_when_absent`, `health_deserializes_error_status`.

- [ ] **Step 3: Register the module** — in `src-tauri/src/lib.rs`, add `mod prompts;` next to the other `mod` declarations (alphabetical, after `mod permission;`):

```rust
mod capture;
mod db;
mod mlx;
mod permission;
mod prompts;
mod server;
mod shortcut;
mod update;
```

`prompts` isn't used by any command yet (that's Task 5) — this just makes it part of the crate so `cargo test` compiles it.

- [ ] **Step 4: Run tests**

```bash
cd src-tauri && cargo test
```

Expected: all PASS — same test count as before the move, just relocated (5 tests moved from `mlx.rs`'s module to `prompts.rs`'s).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/prompts.rs src-tauri/src/mlx.rs src-tauri/src/lib.rs
git commit -m "refactor: extract format prompts into an arch-neutral prompts module"
```

---

### Task 3: `llamacpp.rs` — the x86_64 engine module

**Files:**
- Create: `src-tauri/src/llamacpp.rs`
- Modify: `src-tauri/src/lib.rs` (register the module, `x86_64`-gated only)

**Interfaces:**
- Consumes: `crate::server::free_port()` and `crate::prompts::{prompt_for, ExtractFormat}` (both already `pub`) — only from the module's own ignored end-to-end test, not from its production code.
- Produces: `llamacpp::health(port: u16) -> Result<HealthStatus, String>`, `llamacpp::extract_from_image(port: u16, image_base64: &str, prompt: &str) -> Result<String, String>`, `llamacpp::HealthStatus { status: ServerStatus, progress: Option<f64> }`, `llamacpp::ServerStatus { Downloading, Loading, Ready, Error }` — the exact surface `mlx.rs` exposes, consumed by Task 5's `engine` alias. Not wired into `lib.rs`'s command dispatch yet — this task is self-contained and additive, doesn't change any existing behavior.

This module isn't referenced by any command yet, so there's no "existing" behavior to break — every test here is new, written test-first.

- [ ] **Step 1: Write the failing tests** — create `src-tauri/src/llamacpp.rs` with just the test module (everything else will 404/not-defined until Step 3):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_url_builds_with_port() {
        assert_eq!(api_url(11500, "/health"), "http://127.0.0.1:11500/health");
    }

    #[test]
    fn map_health_status_ready_on_200() {
        assert_eq!(map_health_status(200), ServerStatus::Ready);
    }

    #[test]
    fn map_health_status_loading_on_503() {
        assert_eq!(map_health_status(503), ServerStatus::Loading);
    }

    #[test]
    fn map_health_status_error_on_anything_else() {
        assert_eq!(map_health_status(500), ServerStatus::Error);
        assert_eq!(map_health_status(404), ServerStatus::Error);
    }

    #[test]
    fn build_request_shapes_image_and_text_content_parts() {
        let req = build_request("QUJD", "Extract as Markdown.");
        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["messages"][0]["content"][0]["type"], "image_url");
        assert_eq!(
            json["messages"][0]["content"][0]["image_url"]["url"],
            "data:image/png;base64,QUJD"
        );
        assert_eq!(json["messages"][0]["content"][1]["type"], "text");
        assert_eq!(json["messages"][0]["content"][1]["text"], "Extract as Markdown.");
    }

    #[test]
    fn chat_response_extracts_first_choice_content() {
        let raw = r#"{"choices":[{"message":{"content":" | a | b |\n"}}]}"#;
        let parsed: ChatResponse = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.choices[0].message.content, " | a | b |\n");
    }
}
```

Add the temporary module registration so this compiles as part of the crate — in `src-tauri/src/lib.rs`, next to `mod mlx;`:

```rust
mod mlx;
#[cfg(target_arch = "x86_64")]
mod llamacpp;
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
rustup target add x86_64-apple-darwin   # one-time, if not already installed
cd src-tauri && cargo test --target x86_64-apple-darwin
```

Expected: FAIL to compile — `api_url`, `map_health_status`, `ServerStatus`, `build_request`, `ChatResponse` are not defined.

- [ ] **Step 3: Implement** — replace `src-tauri/src/llamacpp.rs` with the full module (test module included, now referencing real items):

```rust
use std::time::Duration;

/// Mirrors `mlx::ServerStatus`'s shape exactly (required for the
/// compile-time engine swap in `lib.rs` to type-check on both
/// architectures). `Downloading` is unreachable via `health()` below —
/// llama-server never reports it, since Rust downloads the model *before*
/// spawning the process (see `server.rs`'s x86_64 `build_env`) — but the
/// variant still has to exist so `lib.rs`'s `mlx_status` match compiles
/// identically on both targets.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum ServerStatus {
    Downloading,
    Loading,
    Ready,
    Error,
}

#[derive(Debug)]
pub struct HealthStatus {
    pub status: ServerStatus,
    /// Always `None` here — llama-server never downloads anything itself,
    /// so there's nothing for this endpoint to report progress on.
    pub progress: Option<f64>,
}

pub fn api_url(port: u16, path: &str) -> String {
    format!("http://127.0.0.1:{port}{path}")
}

/// Maps llama-server's `/health` HTTP status code to `ServerStatus`.
/// llama-server signals "still loading the model" with a 503, not a 200
/// body field like MLX's custom `/health` does.
fn map_health_status(http_status: u16) -> ServerStatus {
    match http_status {
        200 => ServerStatus::Ready,
        503 => ServerStatus::Loading,
        _ => ServerStatus::Error,
    }
}

/// GET /health. `Err` means the server isn't reachable yet (still
/// starting) — mirrors `mlx::health`'s contract exactly, even though the
/// underlying signal (HTTP status code vs. JSON body field) differs.
pub async fn health(port: u16) -> Result<HealthStatus, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(api_url(port, "/health"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(HealthStatus {
        status: map_health_status(resp.status().as_u16()),
        progress: None,
    })
}

#[derive(serde::Serialize)]
struct ImageUrl {
    url: String,
}

#[derive(serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentPart {
    ImageUrl { image_url: ImageUrl },
    Text { text: String },
}

#[derive(serde::Serialize)]
struct ChatMessage {
    role: &'static str,
    content: Vec<ContentPart>,
}

#[derive(serde::Serialize)]
struct ChatRequest {
    // Ignored by llama-server outside its multi-model router mode, but the
    // OpenAI-compatible schema requires a non-empty string.
    model: &'static str,
    messages: Vec<ChatMessage>,
    max_tokens: u32,
}

fn build_request(image_base64: &str, prompt: &str) -> ChatRequest {
    ChatRequest {
        model: "beaver-local",
        messages: vec![ChatMessage {
            role: "user",
            content: vec![
                ContentPart::ImageUrl {
                    image_url: ImageUrl {
                        url: format!("data:image/png;base64,{image_base64}"),
                    },
                },
                ContentPart::Text {
                    text: prompt.to_string(),
                },
            ],
        }],
        max_tokens: 1024,
    }
}

#[derive(serde::Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(serde::Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(serde::Deserialize)]
struct ChoiceMessage {
    content: String,
}

/// POST /v1/chat/completions. Returns the extracted Markdown, or a
/// user-readable error string — same `Result<String, String>` contract as
/// `mlx::extract_from_image`. A 503 here means the model is still loading.
pub async fn extract_from_image(
    port: u16,
    image_base64: &str,
    prompt: &str,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let body = build_request(image_base64, prompt);
    let resp = client
        .post(api_url(port, "/v1/chat/completions"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("llama.cpp request failed: {e}"))?;
    let result: ChatResponse = resp
        .error_for_status()
        .map_err(|e| format!("llama.cpp server error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse llama.cpp response: {e}"))?;
    let text = result
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| "llama.cpp response had no choices".to_string())?;
    Ok(text.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};

    #[test]
    fn api_url_builds_with_port() {
        assert_eq!(api_url(11500, "/health"), "http://127.0.0.1:11500/health");
    }

    #[test]
    fn map_health_status_ready_on_200() {
        assert_eq!(map_health_status(200), ServerStatus::Ready);
    }

    #[test]
    fn map_health_status_loading_on_503() {
        assert_eq!(map_health_status(503), ServerStatus::Loading);
    }

    #[test]
    fn map_health_status_error_on_anything_else() {
        assert_eq!(map_health_status(500), ServerStatus::Error);
        assert_eq!(map_health_status(404), ServerStatus::Error);
    }

    #[test]
    fn build_request_shapes_image_and_text_content_parts() {
        let req = build_request("QUJD", "Extract as Markdown.");
        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["messages"][0]["content"][0]["type"], "image_url");
        assert_eq!(
            json["messages"][0]["content"][0]["image_url"]["url"],
            "data:image/png;base64,QUJD"
        );
        assert_eq!(json["messages"][0]["content"][1]["type"], "text");
        assert_eq!(json["messages"][0]["content"][1]["text"], "Extract as Markdown.");
    }

    #[test]
    fn chat_response_extracts_first_choice_content() {
        let raw = r#"{"choices":[{"message":{"content":" | a | b |\n"}}]}"#;
        let parsed: ChatResponse = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.choices[0].message.content, " | a | b |\n");
    }

    /// End-to-end proof against a real `llama-server`. Ignored by default
    /// (spawns a real process and needs a real GGUF model on disk) — the
    /// Intel CI workflow (Task 7) runs it explicitly with
    /// `BEAVER_TEST_GGUF_MODEL` / `BEAVER_TEST_MMPROJ` pointed at a cached
    /// model. Skips locally if those env vars aren't set, so a plain
    /// `cargo test --target x86_64-apple-darwin` never tries to spawn a
    /// multi-GB download. Requires Task 6's bundled binary and Task 1's
    /// fixture to exist on disk to actually run.
    #[tokio::test]
    #[ignore]
    async fn health_and_extract_against_a_real_llama_server() {
        let (Ok(model), Ok(mmproj)) = (
            std::env::var("BEAVER_TEST_GGUF_MODEL"),
            std::env::var("BEAVER_TEST_MMPROJ"),
        ) else {
            eprintln!("skipping: BEAVER_TEST_GGUF_MODEL / BEAVER_TEST_MMPROJ not set");
            return;
        };
        let llama_server = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/llama/llama-server");
        let port = crate::server::free_port().expect("no free port");

        let mut child = std::process::Command::new(&llama_server)
            .arg("-m").arg(&model)
            .arg("--mmproj").arg(&mmproj)
            .arg("--host").arg("127.0.0.1")
            .arg("--port").arg(port.to_string())
            .spawn()
            .expect("failed to spawn llama-server");

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(300);
        loop {
            if let Ok(h) = health(port).await {
                if h.status == ServerStatus::Ready {
                    break;
                }
            }
            assert!(std::time::Instant::now() < deadline, "llama-server never became ready");
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        let fixture = std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/table-sample.png"),
        )
        .expect("fixture image must exist — see Task 1");
        let image_base64 = STANDARD.encode(&fixture);
        let prompt = crate::prompts::prompt_for(crate::prompts::ExtractFormat::Markdown, None);

        let result = extract_from_image(port, &image_base64, &prompt)
            .await
            .expect("extraction must succeed");

        let _ = child.kill();

        assert!(result.contains('|'), "expected a Markdown table separator in: {result}");
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test --target x86_64-apple-darwin
```

Expected: all PASS except the one `#[ignore]`d test, which is skipped (not failed) by default. Also run `cargo test` (default target) to confirm nothing on the aarch64 side changed: expected unchanged PASS count from Task 2.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/llamacpp.rs src-tauri/src/lib.rs
git commit -m "feat: add the llama.cpp engine module (health, extract_from_image)"
```

---

### Task 4: `server.rs` — arch-gated setup flow and model download

**Files:**
- Modify: `src-tauri/src/server.rs`

**Interfaces:**
- Consumes: nothing new from outside this file.
- Produces: `MlxServer.download_progress: Mutex<Option<f64>>` (new field, read by Task 5's `mlx_status`), arch-gated `env_is_ready`/`build_env`/`spawn_server` (same signatures as today, called unconditionally by `lib.rs`'s `spawn_setup` — Task 5 doesn't need to touch those call sites at all), `pub const SERVER_LOG_FILENAME: &str = "engine-server.log"`.

The MLX-specific helpers (`venv_python`, `hf_home`, `deps_marker`, `uv_command`, `server_args`, the `VENV_DIRNAME`/`HF_DIRNAME`/`UV_*_DIRNAME` constants) are used by nothing except `build_env`/`spawn_server`'s aarch64 variants, so they get gated too — otherwise they're dead code on an x86_64 build.

- [ ] **Step 1: Write the failing tests** — append to `server.rs`'s existing `#[cfg(test)] mod tests` block:

```rust
    #[test]
    fn new_mlx_server_starts_with_no_download_progress() {
        let s = MlxServer::new(11500);
        assert!(s.download_progress.lock().unwrap().is_none());
    }

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn download_fraction_computes_ratio() {
        assert_eq!(download_fraction(50, 200), 0.25);
    }

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn download_fraction_clamps_to_one() {
        assert_eq!(download_fraction(300, 200), 1.0);
    }

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn download_fraction_avoids_division_by_zero() {
        assert_eq!(download_fraction(0, 0), 1.0);
    }
```

`env_is_ready` itself takes a `&tauri::AppHandle`, which can't be constructed in a unit test — same as `build_env`/`spawn_server`, it's covered by Task 7's real CI run and by manual verification, not a unit test. Don't write a test that can't actually call it; a test asserting two arbitrary filenames don't exist in an empty temp dir would pass regardless of whether `env_is_ready`'s logic is correct, which isn't a real test.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test
```
Expected: FAIL — `download_progress` field doesn't exist on `MlxServer`.
```bash
cargo test --target x86_64-apple-darwin
```
Expected: FAIL — `download_fraction` not defined.

- [ ] **Step 3: Gate the MLX-specific constants and helpers to `aarch64`** — in `server.rs`, add `#[cfg(target_arch = "aarch64")]` directly above each of these existing items (no other changes to their bodies):

```rust
#[cfg(target_arch = "aarch64")]
const VENV_DIRNAME: &str = "mlx-venv";
#[cfg(target_arch = "aarch64")]
const HF_DIRNAME: &str = "hf-cache";
#[cfg(target_arch = "aarch64")]
const UV_CACHE_DIRNAME: &str = "uv-cache";
#[cfg(target_arch = "aarch64")]
const UV_PYTHON_DIRNAME: &str = "uv-python";
```

and, further down:

```rust
#[cfg(target_arch = "aarch64")]
pub fn venv_python(app: &tauri::AppHandle) -> PathBuf { ... }   // body unchanged

#[cfg(target_arch = "aarch64")]
pub fn hf_home(app: &tauri::AppHandle) -> PathBuf { ... }       // body unchanged

#[cfg(target_arch = "aarch64")]
fn deps_marker(app: &tauri::AppHandle) -> PathBuf { ... }       // body unchanged

#[cfg(target_arch = "aarch64")]
fn uv_command(app: &tauri::AppHandle) -> Command { ... }        // body unchanged

#[cfg(target_arch = "aarch64")]
pub fn server_args(script: &std::path::Path, port: u16, parent_pid: u32) -> Vec<String> { ... } // body unchanged
```

- [ ] **Step 4: Add the x86_64 model constants** — near the top of the file, alongside the now-gated MLX constants:

```rust
#[cfg(target_arch = "x86_64")]
const MODEL_DIRNAME: &str = "models";
#[cfg(target_arch = "x86_64")]
const GGUF_MODEL_FILENAME: &str = "minicpm-v-2_6-q4_k_m.gguf";
#[cfg(target_arch = "x86_64")]
const MMPROJ_FILENAME: &str = "minicpm-v-2_6-mmproj-f16.gguf";
#[cfg(target_arch = "x86_64")]
const GGUF_MODEL_URL: &str =
    "https://huggingface.co/openbmb/MiniCPM-V-2_6-gguf/resolve/main/ggml-model-Q4_K_M.gguf";
#[cfg(target_arch = "x86_64")]
const MMPROJ_URL: &str =
    "https://huggingface.co/openbmb/MiniCPM-V-2_6-gguf/resolve/main/mmproj-model-f16.gguf";
```

(Swap these four if Task 1's validation picked the Qwen2-VL fallback instead.)

- [ ] **Step 5: Add the `download_progress` field** — in the `MlxServer` struct and its `new`:

```rust
pub struct MlxServer {
    pub port: u16,
    pub child: Mutex<Option<Child>>,
    pub phase: Mutex<SetupPhase>,
    /// Short user-readable reason when phase == Failed.
    pub failure: Mutex<Option<String>>,
    /// Guards against stacked setup threads on rapid retries.
    pub setup_running: AtomicBool,
    /// Model-download progress (0.0-1.0) during `SetupPhase::BuildingEnv`.
    /// Only ever populated on the x86_64 (llama.cpp) `build_env`, which
    /// downloads the model before spawning the server; the aarch64 (MLX)
    /// `build_env` leaves it `None` — MLX's own download progress is
    /// reported later, through `health` during `StartingServer`.
    pub download_progress: Mutex<Option<f64>>,
}

impl MlxServer {
    pub fn new(port: u16) -> Self {
        Self {
            port,
            child: Mutex::new(None),
            phase: Mutex::new(SetupPhase::BuildingEnv),
            failure: Mutex::new(None),
            setup_running: AtomicBool::new(false),
            download_progress: Mutex::new(None),
        }
    }
```

- [ ] **Step 6: Add the shared log-file helper and rename the log file** — add this near `resolve_resource`, and add `pub const SERVER_LOG_FILENAME: &str = "engine-server.log";` near the top of the file:

```rust
pub const SERVER_LOG_FILENAME: &str = "engine-server.log";

/// Open (stdout, stderr) handles onto the shared engine log, appending.
/// Best-effort: `None` means logging is skipped, never a hard failure.
fn open_server_log(app: &tauri::AppHandle) -> Option<(std::fs::File, std::fs::File)> {
    let log_dir = app.path().app_log_dir().ok()?;
    std::fs::create_dir_all(&log_dir).ok()?;
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join(SERVER_LOG_FILENAME))
        .ok()?;
    let err_file = file.try_clone().ok()?;
    Some((file, err_file))
}
```

- [ ] **Step 7: Rewrite `env_is_ready` and `spawn_server` (aarch64), add the x86_64 variants** — `env_is_ready` becomes two arch-gated functions:

```rust
#[cfg(target_arch = "aarch64")]
pub fn env_is_ready(app: &tauri::AppHandle) -> bool {
    deps_marker(app).exists()
}

#[cfg(target_arch = "x86_64")]
pub fn env_is_ready(app: &tauri::AppHandle) -> bool {
    let dir = app_data(app).join(MODEL_DIRNAME);
    dir.join(GGUF_MODEL_FILENAME).exists() && dir.join(MMPROJ_FILENAME).exists()
}
```

Replace the existing (unconditional) `spawn_server` with an aarch64-gated version using the new log helper:

```rust
#[cfg(target_arch = "aarch64")]
pub fn spawn_server(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let python = venv_python(app);
    let script = resolve_resource(app, "mlx_server.py");
    let mut cmd = Command::new(python);
    cmd.args(server_args(&script, port, std::process::id()))
        .env("HF_HOME", hf_home(app));

    if let Some((out, err)) = open_server_log(app) {
        cmd.stdout(std::process::Stdio::from(out))
            .stderr(std::process::Stdio::from(err));
    }

    cmd.spawn().map_err(|e| format!("failed to spawn MLX server: {e}"))
}

#[cfg(target_arch = "x86_64")]
pub fn spawn_server(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let llama_server = resolve_resource(app, "llama/llama-server");
    let models_dir = app_data(app).join(MODEL_DIRNAME);
    let model_path = models_dir.join(GGUF_MODEL_FILENAME);
    let mmproj_path = models_dir.join(MMPROJ_FILENAME);

    let mut cmd = Command::new(llama_server);
    cmd.arg("-m").arg(&model_path)
        .arg("--mmproj").arg(&mmproj_path)
        .arg("--host").arg("127.0.0.1")
        .arg("--port").arg(port.to_string());

    if let Some((out, err)) = open_server_log(app) {
        cmd.stdout(std::process::Stdio::from(out))
            .stderr(std::process::Stdio::from(err));
    }

    cmd.spawn().map_err(|e| format!("failed to spawn llama-server: {e}"))
}
```

- [ ] **Step 8: Rewrite `build_env` (aarch64, unchanged body) and add the x86_64 variant with progress tracking** — gate the existing `build_env`:

```rust
#[cfg(target_arch = "aarch64")]
pub fn build_env(app: &tauri::AppHandle) -> Result<(), String> {
    // ...unchanged body...
}
```

Add the download helpers and the x86_64 `build_env`:

```rust
#[cfg(target_arch = "x86_64")]
fn download_fraction(downloaded: u64, total: u64) -> f64 {
    if total == 0 {
        return 1.0;
    }
    (downloaded as f64 / total as f64).min(1.0)
}

#[cfg(target_arch = "x86_64")]
async fn download_with_progress(
    client: &reqwest::Client,
    url: &str,
    dest: &std::path::Path,
    progress: &Mutex<Option<f64>>,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let mut resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("download failed: {e}"))?;
    let total = resp.content_length();
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("create {}: {e}", dest.display()))?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("download chunk failed: {e}"))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("write {}: {e}", dest.display()))?;
        downloaded += chunk.len() as u64;
        if let Some(total) = total {
            *progress.lock().unwrap() = Some(download_fraction(downloaded, total));
        }
    }
    Ok(())
}

/// Downloads the GGUF model + mmproj (skipped if already present — an
/// interrupted first run resumes cleanly on the next launch since it
/// re-downloads only what's missing) and verifies the bundled `llama-server`
/// binary is executable. No venv, no pip install — see the module doc.
#[cfg(target_arch = "x86_64")]
pub fn build_env(app: &tauri::AppHandle) -> Result<(), String> {
    let data = app_data(app);
    std::fs::create_dir_all(&data).map_err(|e| format!("create app data dir: {e}"))?;

    let llama_server = resolve_resource(app, "llama/llama-server");
    if let Ok(meta) = std::fs::metadata(&llama_server) {
        if meta.permissions().mode() & 0o111 == 0 {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&llama_server, perms);
        }
    }

    let models_dir = data.join(MODEL_DIRNAME);
    std::fs::create_dir_all(&models_dir).map_err(|e| format!("create models dir: {e}"))?;
    let model_path = models_dir.join(GGUF_MODEL_FILENAME);
    let mmproj_path = models_dir.join(MMPROJ_FILENAME);

    if model_path.exists() && mmproj_path.exists() {
        return Ok(());
    }

    let state = app.state::<MlxServer>();
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("build download client: {e}"))?;
    tauri::async_runtime::block_on(download_with_progress(
        &client,
        GGUF_MODEL_URL,
        &model_path,
        &state.download_progress,
    ))?;
    tauri::async_runtime::block_on(download_with_progress(
        &client,
        MMPROJ_URL,
        &mmproj_path,
        &state.download_progress,
    ))?;
    Ok(())
}
```

- [ ] **Step 9: Update the disk-space comment** — `SETUP_DISK_NEEDED_BYTES`'s doc comment currently says "First-run setup needs venv (~2 GB) + model (~3 GB) + headroom." Update to:

```rust
/// First-run setup needs headroom for either engine's first download: MLX's
/// venv (~2 GB) + model (~3 GB), or llama.cpp's GGUF model + mmproj (~5.7 GB).
pub const SETUP_DISK_NEEDED_BYTES: u64 = 8 * 1024 * 1024 * 1024;
```

(The constant itself is unchanged — 8 GB already covers both cases with headroom.)

- [ ] **Step 10: Run tests to verify they pass**

```bash
cd src-tauri && cargo test
```
Expected: all PASS (aarch64 default target — exercises the gated MLX path, unchanged behavior, plus the new `new_mlx_server_starts_with_no_download_progress` test).
```bash
cargo test --target x86_64-apple-darwin
```
Expected: all PASS, including the three `download_fraction_*` tests.

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/server.rs
git commit -m "feat: arch-gate the setup flow, add llama.cpp model download with progress"
```

---

### Task 5: `lib.rs` — compile-time engine swap

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `prompts::{ExtractFormat, prompt_for}` (Task 2), `engine::{health, extract_from_image, HealthStatus, ServerStatus}` where `engine` aliases `mlx` (aarch64, unchanged) or `llamacpp` (x86_64, Task 3), `server::MlxServer.download_progress` (Task 4).
- Produces: the actual compile-time swap — this is the task where Intel builds start running the real llama.cpp path end to end at the command layer.

This task is pure wiring — no new pure logic to unit-test beyond "both targets still compile and every existing test still passes," which is exactly what the codebase's existing testing philosophy already draws the line at for this kind of command-dispatch code (`mlx_status`/`capture_and_extract`/`re_extract` have never had direct unit tests; the tested surface is `is_truthy` and `LastCapture`, both untouched here).

- [ ] **Step 1: Gate `mod mlx;`, register the engine alias** — in `src-tauri/src/lib.rs`:

```rust
mod capture;
mod db;
#[cfg(target_arch = "aarch64")]
mod mlx;
#[cfg(target_arch = "x86_64")]
mod llamacpp;
mod permission;
mod prompts;
mod server;
mod shortcut;
mod update;

#[cfg(target_arch = "aarch64")]
use mlx as engine;
#[cfg(target_arch = "x86_64")]
use llamacpp as engine;
```

- [ ] **Step 2: Update `capture_and_extract`** — replace:

```rust
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
```

with:

```rust
async fn capture_and_extract(
    region: capture::CaptureRegion,
    format: Option<prompts::ExtractFormat>,
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
    let prompt = prompts::prompt_for(format.unwrap_or(prompts::ExtractFormat::Markdown), None);
    engine::extract_from_image(port, &image_base64, &prompt).await
}
```

- [ ] **Step 3: Update `re_extract`** — replace:

```rust
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

with:

```rust
async fn re_extract(
    format: prompts::ExtractFormat,
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
    let prompt = prompts::prompt_for(format, hint.as_deref());
    engine::extract_from_image(state.port, &image_base64, &prompt).await
}
```

- [ ] **Step 4: Update `mlx_status`** — replace the `match phase` block:

```rust
    let (label, progress) = match phase {
        server::SetupPhase::BuildingEnv => ("preparing".to_string(), None),
        server::SetupPhase::Failed => ("error".to_string(), None),
        server::SetupPhase::StartingServer | server::SetupPhase::ServerUp => {
            match mlx::health(port).await {
                Ok(h) => {
                    let label = match h.status {
                        mlx::ServerStatus::Downloading => "downloading",
                        mlx::ServerStatus::Loading => "loading",
                        mlx::ServerStatus::Ready => "ready",
                        mlx::ServerStatus::Error => "error",
                    }
                    .to_string();
                    (label, h.progress)
                }
                Err(_) => ("starting".to_string(), None),
            }
        }
    };
```

with:

```rust
    let (label, progress) = match phase {
        server::SetupPhase::BuildingEnv => {
            ("preparing".to_string(), *state.download_progress.lock().unwrap())
        }
        server::SetupPhase::Failed => ("error".to_string(), None),
        server::SetupPhase::StartingServer | server::SetupPhase::ServerUp => {
            match engine::health(port).await {
                Ok(h) => {
                    let label = match h.status {
                        engine::ServerStatus::Downloading => "downloading",
                        engine::ServerStatus::Loading => "loading",
                        engine::ServerStatus::Ready => "ready",
                        engine::ServerStatus::Error => "error",
                    }
                    .to_string();
                    (label, h.progress)
                }
                Err(_) => ("starting".to_string(), None),
            }
        }
    };
```

- [ ] **Step 5: Run tests on both targets**

```bash
cd src-tauri && cargo test
```
Expected: all PASS — unchanged aarch64 behavior (exercises `engine = mlx`).
```bash
cargo test --target x86_64-apple-darwin
```
Expected: all PASS — this is the first point where the *whole* crate (not just `llamacpp.rs` in isolation) compiles for x86_64 with `engine = llamacpp` wired through the real command dispatch.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: wire the compile-time engine alias into the command layer"
```

---

### Task 6: Bundle the `llama-server` binary

**Files:**
- Create: `src-tauri/resources/llama/` (10 binary files: `llama-server` + 9 dylibs)
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/server.rs` (add a resource-integrity test)

**Interfaces:**
- Produces: the actual `resolve_resource(app, "llama/llama-server")` target that Task 4's `build_env`/`spawn_server` already reference by path.

`otool -L` on the release binary shows it depends on exactly 9 `@rpath`-relative dylibs (plus system frameworks always present on macOS) and has `LC_RPATH = @loader_path` — so bundling it alongside those 9 dylibs in one directory is sufficient; no `install_name_tool` fixup needed. The release ships ~40 files total (CLI tools we don't need); only these 10 are required.

- [ ] **Step 1: Fetch and stage the binary + its dependencies**

```bash
SCRATCH=$(mktemp -d)
curl -sL -o "$SCRATCH/llama.tar.gz" \
  "https://github.com/ggml-org/llama.cpp/releases/download/b10061/llama-b10061-bin-macos-x64.tar.gz"
tar -xzf "$SCRATCH/llama.tar.gz" -C "$SCRATCH"

mkdir -p src-tauri/resources/llama
for f in llama-server \
         libllama-server-impl.dylib \
         libllama-common.0.dylib \
         libmtmd.0.dylib \
         libllama.0.dylib \
         libggml.0.dylib \
         libggml-cpu.0.dylib \
         libggml-blas.0.dylib \
         libggml-rpc.0.dylib \
         libggml-base.0.dylib; do
  cp "$SCRATCH/llama-b10061/$f" src-tauri/resources/llama/
done
chmod +x src-tauri/resources/llama/llama-server

file src-tauri/resources/llama/llama-server   # expect: Mach-O 64-bit executable x86_64
otool -L src-tauri/resources/llama/llama-server   # every @rpath entry must match a file in this directory
```

- [ ] **Step 2: Add the resources entry** — in `src-tauri/tauri.conf.json`, add `"resources/llama"` to `bundle.resources`:

```json
    "resources": [
      "resources/uv",
      "resources/mlx_server.py",
      "resources/requirements.lock",
      "resources/llama"
    ]
```

- [ ] **Step 3: Write the resource-integrity test** — append to `server.rs`'s test module (guards against a future llama.cpp version bump silently adding or renaming a dylib dependency without the bundle being updated to match):

```rust
    #[cfg(target_arch = "x86_64")]
    fn llama_resource_dir() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join("llama")
    }

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn llama_server_binary_is_bundled_and_executable() {
        let bin = llama_resource_dir().join("llama-server");
        assert!(bin.exists(), "expected {} to exist", bin.display());
        let meta = std::fs::metadata(&bin).unwrap();
        assert!(meta.permissions().mode() & 0o111 != 0, "llama-server must be executable");
    }

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn every_rpath_dylib_dependency_is_present_alongside_the_binary() {
        let dir = llama_resource_dir();
        let bin = dir.join("llama-server");
        let output = std::process::Command::new("otool")
            .arg("-L")
            .arg(&bin)
            .output()
            .expect("otool must be available on macOS");
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines().skip(1) {
            if let Some(name) = line.trim().split(' ').next().and_then(|p| p.strip_prefix("@rpath/")) {
                assert!(dir.join(name).exists(), "missing bundled dependency: {name}");
            }
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test --target x86_64-apple-darwin
```
Expected: all PASS, including the two new resource-integrity tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/resources/llama src-tauri/tauri.conf.json src-tauri/src/server.rs
git commit -m "feat: bundle the llama-server binary and its runtime dependencies"
```

---

### Task 7: Intel CI workflow and docs

**Files:**
- Create: `.github/workflows/test-llamacpp-intel.yml`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 3's `#[ignore]`d integration test (`BEAVER_TEST_GGUF_MODEL`/`BEAVER_TEST_MMPROJ` env vars), Task 6's bundled binary, Task 1's fixture images.
- Produces: the CI job decision 5 requires — a native Intel build, the full test suite, and one real end-to-end extraction, gated on `workflow_dispatch` + a path filter (not every push).

- [ ] **Step 1: Write the workflow**

```yaml
name: Test llama.cpp Intel engine

on:
  workflow_dispatch:
  push:
    paths:
      - 'src-tauri/src/llamacpp.rs'
      - 'src-tauri/src/server.rs'
      - 'src-tauri/src/prompts.rs'
      - 'src-tauri/src/lib.rs'
      - 'src-tauri/resources/llama/**'
      - 'src-tauri/tests/fixtures/**'
      - '.github/workflows/test-llamacpp-intel.yml'

jobs:
  test:
    name: Build and test (native Intel)
    runs-on: macos-15-intel

    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Rust
        run: |
          rustup toolchain install stable --profile minimal
          rustup default stable

      - name: Cache the MiniCPM-V test model
        id: model-cache
        uses: actions/cache@v4
        with:
          path: src-tauri/tests/.model-cache
          key: minicpmv-2_6-q4_k_m-mmproj-f16-v1

      - name: Download the test model (cache miss only)
        if: steps.model-cache.outputs.cache-hit != 'true'
        run: |
          mkdir -p src-tauri/tests/.model-cache
          curl -sL -o src-tauri/tests/.model-cache/model.gguf \
            "https://huggingface.co/openbmb/MiniCPM-V-2_6-gguf/resolve/main/ggml-model-Q4_K_M.gguf"
          curl -sL -o src-tauri/tests/.model-cache/mmproj.gguf \
            "https://huggingface.co/openbmb/MiniCPM-V-2_6-gguf/resolve/main/mmproj-model-f16.gguf"

      - name: cargo test (including the real end-to-end extraction)
        working-directory: src-tauri
        env:
          BEAVER_TEST_GGUF_MODEL: ${{ github.workspace }}/src-tauri/tests/.model-cache/model.gguf
          BEAVER_TEST_MMPROJ: ${{ github.workspace }}/src-tauri/tests/.model-cache/mmproj.gguf
        run: cargo test -- --include-ignored
```

No cross-compilation and no `rustup target add` — `macos-15-intel` is natively x86_64, so the default target already builds the Intel path; `cargo test` alone exercises `llamacpp.rs`, the x86_64 half of `server.rs`, and the full `lib.rs` command dispatch. `--include-ignored` is what actually runs Task 3's real-server extraction test instead of skipping it.

- [ ] **Step 2: Ignore the local model-cache scratch dir** — append to `.gitignore`, under the existing Rust section:

```
# llama.cpp Intel CI test model cache (downloaded, not committed)
src-tauri/tests/.model-cache/
```

- [ ] **Step 3: Update the README's Prerequisites** — in `README.md`, the "## Prerequisites" section currently reads:

```markdown
## Prerequisites

- macOS on Apple Silicon
- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) + [pnpm](https://pnpm.io)
- [uv](https://github.com/astral-sh/uv) — used to provision the Python vision environment
```

Replace with:

```markdown
## Prerequisites

- macOS (Apple Silicon uses the MLX vision backend; Intel Macs can now build
  and run from source against a llama.cpp local engine — see
  `src-tauri/src/llamacpp.rs`. Packaged Intel releases aren't shipped yet.)
- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) + [pnpm](https://pnpm.io)
- [uv](https://github.com/astral-sh/uv) — used to provision the Python vision environment on Apple Silicon
```

Leave the top-of-file banner ("Apple Silicon only...") and the "## Install" / "## Building a release" sections untouched — those describe the *shipped, packaged* app, which is still Apple-Silicon-only per this plan's scope (no DMG publishing for Intel yet).

- [ ] **Step 4: Full verification**

```bash
cd src-tauri && cargo test && cargo test --target x86_64-apple-darwin
cd .. && pnpm build   # confirm the untouched frontend still type-checks + bundles
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/test-llamacpp-intel.yml .gitignore README.md
git commit -m "ci: add native Intel workflow for the llama.cpp engine, document from-source support"
```

---

## Self-Review Notes

- **Spec coverage:** native `llama-server`, no Python → Tasks 3–6; compile-time `#[cfg(target_arch)]` swap → Task 5 (built on Tasks 2–4); model validation before building on top → Task 1 (gates everything else); no-Python download flow with progress → Task 4; GitHub Actions Intel runner with real end-to-end verification → Task 7; kept names (`MlxServer`/`SetupPhase`/`ServerStatus`/`mlx_status`), engine-neutral log filename → Task 4 Steps 5–6; bundling both `uv` and `llama-server` unconditionally → Task 6 Step 2 (matches the spec's accepted trade-off, no per-arch resource config fighting).
- **Deliberate scope cuts (YAGNI), reconfirmed against Global Constraints:** no x86_64 DMG/updater entry, no Settings UI, no universal DMG, no GPU acceleration — nothing in any task touches `release-macos.yml`, `release-macos.sh`, `tauri.conf.json`'s updater block, or adds an `-ngl` flag.
- **Type consistency:** `engine::ServerStatus`/`engine::HealthStatus` in `llamacpp.rs` (Task 3) match the variant names `lib.rs`'s `mlx_status` match arms use (Task 5) — `Downloading`/`Loading`/`Ready`/`Error`, all four present even though `Downloading` is unreachable via `health()`. `extract_from_image`/`health` signatures match `mlx.rs`'s exactly (`port: u16`, returns `Result<_, String>`). `download_progress` field name matches between its definition (Task 4 Step 5) and its two readers (Task 4's `build_env`, Task 5's `mlx_status`).
- **Research grounded, not assumed:** the llama.cpp release tag, HF model URLs (and their exact byte sizes), the `llama-server` CLI flags, the `/health` 200-vs-503 behavior, the `/v1/chat/completions` image-content-part JSON shape, and the exact 9-dylib dependency list were all verified against the real artifacts during planning (downloaded, inspected with `file`/`otool`/`curl -I`, and — for the CLI flags — run with `arch -x86_64 ... --help` under Rosetta), not inferred from documentation alone. The `macos-15-intel` runner label was confirmed current (not `macos-13`, which is fully retired) as of 2026-07-17.
- **Known risk, not mitigated here (matches the spec's Risks section):** `llama-server` has no parent-death watchdog like `mlx_server.py`'s `--parent-pid` thread. A Beaver crash on Intel could orphan the process. Out of scope for this plan per the spec; flagged again here so it isn't lost.
