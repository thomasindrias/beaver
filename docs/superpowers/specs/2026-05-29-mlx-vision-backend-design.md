# Osprey MLX Vision Backend — Design Spec

**Date:** 2026-05-29
**Status:** Approved (design); pending spec review before planning
**Author:** Thomas Indrias / Claude

---

## Problem

Osprey extracts structured Markdown from a captured screen region using a local vision model. The current backend runs **Ollama + qwen2.5vl:3b**, which has two real problems on the target hardware (a 16 GB Apple Silicon Mac):

1. **Memory pressure.** The Ollama model is ~10.5 GiB resident. On a 16 GB machine that leaves almost nothing for macOS + the app + the dev tooling, causing swap thrashing and multi-second lag on warm-up. This is the friction users feel on first capture.
2. **Reliability.** During benchmarking, Ollama crashed on a specific capture with a Metal/ggml assertion (`GGML_ASSERT(a->ne[2] * 4 == b->ne[0])`), returning HTTP 500 after a 2-minute hang. MLX processed the same image without issue.

### Benchmark (decisive)

Same image (`/tmp/osprey-bench.png`, 1568×1015), same extraction prompt:

| Backend | Resident RAM | Load time | Generation | Outcome |
|---|---|---|---|---|
| **Ollama** qwen2.5vl:3b | ~10.5 GiB | 17.3 s | — | Could not complete on 16 GB (crash / swap thrash) |
| **MLX** Qwen2.5-VL-3B-Instruct-4bit | ~1.57 GB | 2.1 s | ~32 s | Completed cleanly |

MLX uses Apple's Metal-native unified-memory framework. The 4-bit model is ~6.7× smaller resident and loads ~8× faster, and it actually finishes on this hardware.

**Decision: replace the Ollama vision backend with MLX.**

---

## Goals

- Cut resident memory from ~10.5 GiB to ~1.6 GiB so the app is comfortable on a 16 GB Mac.
- Keep the model warm so a burst of captures stays fast (no repeated cold load).
- Preserve the existing capture → extract → clipboard data flow and the frontend contract unchanged.
- Bundle everything needed so a user with no Python toolchain can run it after install.

## Non-Goals

- Cross-platform support. **Apple Silicon only** — MLX is Metal/ARM-specific and this is baked in.
- Cloud fallback. Local-only, by design (privacy + no per-call cost).
- Model selection UI. One model, hard-coded, same as today.
- Reducing the ~32 s worst-case generation latency below what the model natively does. (See Risks.)

---

## Architecture

Replace the Ollama sidecar with a **persistent local MLX vision server** written in Python, spawned and supervised by the Rust core, kept warm for the app's lifetime (~1.6 GB resident).

```
┌─────────────────────────────────────────────────────────┐
│ Osprey (Tauri)                                            │
│                                                           │
│  React frontend ── invoke ──▶ capture_and_extract (Rust)  │
│                                      │                     │
│                                      ▼                     │
│                                  mlx.rs                    │
│                                      │ HTTP (localhost)    │
│                                      ▼                     │
│  ┌──────────────────────────────────────────────────┐    │
│  │ mlx_server.py  (uvicorn, child process)           │    │
│  │   GET  /health   → {status, progress}             │    │
│  │   POST /extract  → {markdown}                      │    │
│  │   Qwen2.5-VL-3B-Instruct-4bit loaded once (~1.6GB) │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Decisions locked during brainstorming

1. **Platform:** Apple Silicon only. No x86 / no Windows / no Linux path. Hard requirement of MLX.
2. **Packaging:** Bundle the `uv` binary (~30 MB, carries its own Python) plus `mlx_server.py` as Tauri resources. On **first run**, build a venv in Application Support and `uv pip install mlx-vlm` into it. We do **not** pre-bake the venv into the app bundle — relocatable venvs break in subtle ways across machines, and building locally on first run is reliable.
3. **Lifecycle:** Persistent warm server. The server process starts at app launch (or just-in-time on first capture if env isn't ready yet) and stays resident, holding the model in memory for the app's lifetime. No keep-alive idle timer — at ~1.6 GB the cost of staying warm is acceptable, and it removes all cold-load latency after startup.

---

## Components

### 1. `mlx_server.py` (new — bundled resource)

A small FastAPI/uvicorn app. `uvicorn` and `fastapi` are already transitive deps of `mlx-vlm`, so no extra packaging surface.

**Endpoints:**

- `GET /health` → `{ "status": "downloading" | "loading" | "ready", "progress": <float 0..1 | null> }`
  - `downloading`: the model weights are being pulled from Hugging Face (first run only). `progress` reflects download fraction when available.
  - `loading`: weights present, model being loaded into memory.
  - `ready`: model loaded, ready to extract.
- `POST /extract` `{ "image_base64": "<str>", "prompt": "<str>" }` → `{ "markdown": "<str>" }`
  - Decodes the image, runs `apply_chat_template(processor, config, prompt, num_images=1)` then `generate(model, processor, formatted, image=[...], max_tokens=1024)`, returns the text.

**Model:** `mlx-community/Qwen2.5-VL-3B-Instruct-4bit`, loaded once at startup via `from mlx_vlm import load`. The server transitions `downloading → loading → ready` and serves `/health` throughout so the Rust side and onboarding UI can reflect progress.

**Port:** bind to `127.0.0.1` on a fixed local port (mirror the Ollama choice of an app-specific port; document the exact number in the plan). Localhost only — never exposed externally.

### 2. `mlx.rs` (new — replaces `ollama.rs`)

Rust client for the local server. Mirrors the shape of the current `ollama.rs` so the call sites change minimally.

- `pub const SERVER_BASE_URL: &str` / `pub fn api_url(path)` — localhost base.
- `pub const EXTRACTION_PROMPT: &str` — moved verbatim from `ollama.rs` (unchanged extraction prompt).
- `pub async fn extract_from_image(image_base64: &str) -> Result<String, String>` — POST `/extract`, parse `{markdown}`, trim, return. Same signature and error-string contract as today's `ollama::extract_from_image`.
- `pub async fn health() -> HealthStatus` — GET `/health`, parse `{status, progress}`. Used by the readiness poller and onboarding.
- **No `warm_model`.** The persistent server makes warm-up implicit; the explicit warm call is removed.
- Keep the `detect_content_type` / `has_table_separator` test helpers and their unit tests (they're backend-agnostic and still useful).

### 3. `lib.rs` (modify)

- **First-run environment setup:** on setup, check whether the Application Support venv exists. If not, run the bundled `uv` to create it and `uv pip install mlx-vlm`. This is the ~2–3 min first-run cost.
- **Spawn the server child:** launch `mlx_server.py` via the venv's Python, hold the child handle in managed state (replacing `OllamaChild` with e.g. `MlxServerChild(Mutex<Option<Child>>)`).
- **Readiness poller:** a background thread/task polls `mlx::health()` until `ready`, so the UI can show progress and captures can wait for readiness.
- Remove the Ollama sidecar spawn block (the `sidecar.args(["serve"]).spawn()` match) and the `tauri::async_runtime::spawn(ollama::warm_model())` call in `show_capture_overlay`.

### 4. Onboarding (modify)

Rework the onboarding flow to reflect MLX setup instead of Ollama install/pull:
- Show **environment setup** progress (venv build + `uv pip install`) on first run.
- Show **model download** progress via `/health` `status: "downloading"` + `progress`.
- Transition to ready when `/health` returns `ready`.

### 5. `tauri.conf.json` / capabilities (modify)

- Add `uv` binary + `mlx_server.py` to bundled **resources**.
- Remove the Ollama `externalBin` entries (both `ollama-aarch64-apple-darwin` and any x86 binary).
- Adjust capabilities if HTTP host permissions referenced the Ollama port.

---

## Data Flow (unchanged)

The capture pipeline and the frontend contract do **not** change:

1. User triggers capture (⌘⇧D) → overlay → region select → screenshot.
2. Rust `capture_and_extract` command base64-encodes the image and calls `mlx::extract_from_image` (was `ollama::extract_from_image`).
3. Markdown result is stored in SQLite and copied to clipboard.
4. Frontend `useOsprey` / `useCaptures` hooks are untouched — same command names, same return shapes.

---

## What gets removed

- `src-tauri/src/ollama.rs` (replaced by `mlx.rs`).
- `OllamaChild` managed state and the Ollama sidecar spawn block in `lib.rs`.
- `ollama::warm_model` and its call site in `show_capture_overlay`.
- `pull_model` / `model_is_installed` Ollama-install logic and any commands exposing them.
- `binaries/ollama-aarch64-apple-darwin` (and any x86 Ollama binary) + their `externalBin` config.
- `OLLAMA_MAX_LOADED_MODELS` and any Ollama env tuning.
- The **Option A `KEEP_ALIVE = "90s"`** change from this session (Ollama-specific; obsolete under MLX).

---

## Error Handling

- **Env build fails** (`uv pip install` error): surface a clear onboarding error with the captured stderr; allow retry. Do not crash the app.
- **Model download fails** (network): `/health` stays `downloading`/errors; onboarding shows a retry. The server should report the failure rather than hang.
- **Server not ready at capture time:** `extract_from_image` should fail fast with a user-readable "model still loading" message (frontend already handles extract errors), or the capture flow waits on readiness — to be decided in the plan, but the contract is a clean error string, never a hang.
- **Server child dies:** detect via the managed child handle / failed HTTP; report and (optionally) attempt one respawn. Keep behavior simple — surface the error.
- **`/extract` model error** (bad image, OOM): return a non-200 with a message; `mlx.rs` maps it to the same `Result<String, String>` error contract as today.

---

## Testing

- **Rust unit tests:** keep `api_url`, content-type detection tests (port them to `mlx.rs`). Add a test for `mlx::health` parsing of each `status` value.
- **Server tests:** a small Python test that POSTs a known image to `/extract` and asserts non-empty Markdown; a `/health` shape test. (Run against a loaded model in dev, not in CI unless a model is cached.)
- **Integration (manual):** fresh-install simulation — delete the Application Support venv + HF cache, launch, verify onboarding shows env build → download → loading → ready, then capture and confirm Markdown on the clipboard.
- **Regression:** existing frontend tests stay green (contract unchanged). Existing Rust tests stay green minus the removed Ollama-specific ones.

---

## Risks & Trade-offs

- **Generation latency ~32 s worst case.** This is the text-heavy, full-screen capture case and scales with output token count; typical smaller captures are faster. This is inherent to the 3B model on this hardware, not a backend bug. Accepted for the memory win. (Could later expose `max_tokens` or a smaller model, out of scope here.)
- **First-run setup ~2–3 min.** Building the venv + `uv pip install mlx-vlm` + model download. One-time, with progress UI. Accepted.
- **Apple Silicon only, hard-baked.** No fallback for Intel Macs or other platforms. Matches the current user base; revisit only if cross-platform becomes a requirement.
- **Bundling a Python toolchain.** Adds the `uv` binary (~30 MB) to the bundle and a venv on disk. Simpler and more reliable than a relocatable pre-baked venv.

---

## Open questions for the plan

- Exact local port number for the MLX server.
- Whether capture **waits** on readiness vs. **fails fast** with a "loading" message (error contract is clean either way).
- Respawn policy if the server child dies (one retry vs. surface-and-stop).
