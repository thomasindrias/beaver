# Beaver llama.cpp Intel Mac Engine — Design Spec

**Date:** 2026-07-17
**Status:** Approved (design); pending spec review before planning
**Author:** Thomas Indrias / Claude

---

## Problem

Beaver's only local vision engine today is MLX, which is hard-baked to Apple
Silicon — Metal/ARM-specific, with no supported Intel or non-Apple path. Per
the engine matrix decided in `docs/ROADMAP.md` (2026-07-17), the local/cloud
engine choice generalizes across hardware: cloud (BYO key) works identically
everywhere once Phase 2 ships, but **local inference is the piece that's
platform-dependent**, and every platform beyond Apple Silicon needs its own
local backend. Intel Mac is the concrete near-term target; Windows/Linux are
explicitly a stretch goal blocked on a much larger port (capture overlay,
global shortcut, tray, permissions).

Without a local engine, Intel Mac users get none of Beaver's core "private by
default" value proposition — only the not-yet-shipped BYO-cloud path would
work there, and only once Phase 2 lands. This spec covers building the
llama.cpp-based local engine that Intel Mac builds compile against instead of
MLX: same job (image in, structured Markdown/CSV/JSON/plain out), served by a
llama.cpp-compatible vision model, with **no Python anywhere in the path**.

---

## Goals

- A working llama.cpp local engine on Intel Mac, matching MLX's *surface*
  (commands, status shape, onboarding flow) — not its speed or quality.
  Intel already won't match Apple Silicon's performance; parity isn't the
  goal.
- No Python for this engine. Rust spawns a native `llama-server` binary
  directly and downloads the model itself.
- Compiler-enforced parity between the two engine modules: a divergence in
  the shared function/type surface fails the Intel build, not a runtime
  surprise.
- A model choice validated against Beaver's real use case (tables, code)
  before the rest of the plan is built on top of it.
- Real, automated, CI-verified proof the Intel path works end-to-end — not a
  manual-only checklist.

## Non-Goals (explicit scope cuts)

- **No x86_64 DMG publishing / updater manifest entry.** This spec proves the
  engine works; shipping it (release pipeline, notarization for a second
  target, a `darwin-x86_64` entry in the updater's `latest.json`) is a
  natural follow-up once validated.
- **No Settings/engine-picker UI.** Doesn't exist yet (Phase 2 in the
  roadmap) and isn't needed here — there's only one possible local engine per
  compiled architecture.
- **No universal single-DMG.** Already an open question in the roadmap;
  staying with separate arch builds, matching the existing pattern.
- **No GPU acceleration on Intel** (e.g. discrete AMD via Vulkan). CPU-only
  inference is the MVP target.

---

## Architecture

**Compile-time engine swap via `#[cfg(target_arch)]`, not a runtime `Engine`
enum/trait.** Beaver already ships separate arch-specific DMGs, so a compiled
binary only ever targets one architecture — there is never a runtime need to
choose between engines. This is chosen explicitly for YAGNI/KISS: no runtime
dispatch, no trait objects, no `Box<dyn Engine>`.

```
src-tauri/src/lib.rs
  #[cfg(target_arch = "aarch64")]
  use mlx as engine;
  #[cfg(target_arch = "x86_64")]
  use llamacpp as engine;

  capture_and_extract(...) -> engine::extract_from_image(...)
  re_extract(...)          -> engine::extract_from_image(...)
  mlx_status(...)          -> engine::health(...)
```

Command bodies call `engine::extract_from_image(...)` / `engine::health(...)`
without knowing which module backs it. Both modules must expose an identical
function/type surface (`extract_from_image`, `health`, `HealthStatus`,
`ServerStatus`) — the compiler enforces parity because a mismatch fails to
compile for that target.

```
                    aarch64 build                         x86_64 build
┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│ lib.rs (engine = mlx)                │   │ lib.rs (engine = llamacpp)           │
│   capture_and_extract / re_extract   │   │   capture_and_extract / re_extract   │
│   mlx_status                         │   │   mlx_status                         │
└───────────────┬───────────────────────┘   └───────────────┬───────────────────────┘
                │ HTTP :port/health, /extract               │ HTTP :port/health,
                │                                            │      /v1/chat/completions
┌───────────────▼───────────────────────┐   ┌───────────────▼───────────────────────┐
│ mlx_server.py (Python, uvicorn)      │   │ llama-server (native binary)         │
│ Qwen2.5-VL-3B-Instruct-4bit           │   │ MiniCPM-V 2.6 GGUF + mmproj           │
└───────────────────────────────────────┘   └───────────────────────────────────────┘
```

---

## Decisions locked during brainstorming

1. **Approach: native `llama-server` binary, Rust-managed, no Python at all
   for this engine.** llama.cpp ships its own HTTP server binary with
   built-in multimodal support (OpenAI-compatible chat API, `--mmproj` for
   vision models). Rust spawns it directly and downloads the model itself.
   Rejected alternatives: a `llama-cpp-python` sidecar (multimodal binding
   support lags the upstream C++ project) and in-process Rust FFI bindings
   (heaviest build complexity, least mature vision support).
2. **Architecture: compile-time engine swap via `#[cfg(target_arch)]`**, not
   a runtime enum/trait — see Architecture above.
3. **Model: MiniCPM-V 2.6** (quantized GGUF + mmproj) as the starting
   candidate — mature llama.cpp multimodal support, known strong OCR/document
   quality, which matters more for Beaver's table/code use case than generic
   captioning. This is a best-current-guess, not certain to still be the
   right pick by implementation time (fast-moving space): the plan must
   include an early validation task (download it, run it against real
   table/code screenshots, confirm quality before building everything else on
   top). Documented fallback if it disappoints: a Qwen2-VL GGUF quant.
   Priority is explicitly *best llama.cpp-supported model* over *matching
   MLX's exact model/quality* — Intel already won't match MLX's speed, so
   parity isn't the goal.
4. **Setup/download flow: no Python on the Intel path.** Rust downloads the
   GGUF model + mmproj directly via `reqwest` streaming from public
   Hugging Face URLs (no auth needed), tracking bytes-vs-Content-Length for
   the same progress percentage the UI already renders for MLX. Once
   downloaded, Rust spawns the bundled `llama-server` binary pointed at the
   local files and polls its `/health`.
5. **Testability: GitHub Actions Intel runner, real end-to-end verification**
   — not a manual-only checklist. New CI job on `runs-on: macos-13` (still
   x86_64 as of this design; re-confirm the exact runner label is still Intel
   at implementation time, GH reshuffles these). Since the runner IS Intel,
   this is a native build, no cross-compilation: `cargo build`/`cargo test`
   directly, plus an integration test that spawns the real `llama-server`,
   downloads the real model (cached via `actions/cache` keyed on the file URL
   so it isn't re-pulled every run), and runs a real extraction against a
   bundled fixture image, asserting the output has expected structure.
   Trigger on `workflow_dispatch` + path-filtered on the llama.cpp-related
   files (not every push), matching how `release-macos.yml` is already
   dispatch-only, for cost/speed reasons.

---

## Components

### 1. `src-tauri/src/prompts.rs` (new, always compiled)

Move `ExtractFormat`, `prompt_for`, `EXTRACTION_PROMPT` / `CSV_PROMPT` /
`JSON_PROMPT` / `PLAIN_PROMPT` out of `mlx.rs` here, unchanged. Pure string
logic with no engine dependency, shared by both `mlx.rs` and `llamacpp.rs`.

### 2. `src-tauri/src/mlx.rs` (existing, gated `#[cfg(target_arch = "aarch64")]`)

Unchanged behavior. Imports `ExtractFormat`/`prompt_for` from `prompts.rs`
instead of defining them locally.

### 3. `src-tauri/src/llamacpp.rs` (new, `#[cfg(target_arch = "x86_64")]`)

Same `extract_from_image` / `health` / `HealthStatus` / `ServerStatus` shapes
as `mlx.rs`, talking to `llama-server`'s OpenAI-compatible chat-completions
API instead of the custom `/extract` endpoint:

- `extract_from_image(port, image_base64, prompt)` → `POST
  /v1/chat/completions` with an image content part (base64 data URI) and the
  format prompt from `prompts.rs`; parses the completion text out of the
  standard chat-completions response shape. Same `Result<String, String>`
  error contract as `mlx::extract_from_image`.
- `health(port)` → `GET /health` against `llama-server`'s own health
  endpoint, which historically reports a loading-model status while the GGUF
  is being read into memory and an ok/ready status once ready (exact string
  shape to be confirmed against the pinned `llama-server` release at
  implementation time — see Open Questions). Mapped to the shared
  `ServerStatus` enum: loading → `Loading`, ready → `Ready`, connection error
  → `Err(..)` (mirrors `mlx::health`'s "not reachable yet" contract). Unlike
  `mlx_server.py`, `llama-server` never reports `Downloading` — by decision 4,
  Rust downloads the model *before* spawning `llama-server`, so there's
  nothing left to download once the process exists. See "Setup progress
  tracking" below for how the downloading phase still surfaces to the UI.

### 4. `src-tauri/src/server.rs` — arch-gated `build_env` / `spawn_server`

- **aarch64 `build_env`**: unchanged — builds the venv, installs `mlx-vlm`.
- **x86_64 `build_env`**: no venv. Verifies the bundled `llama-server` binary
  is executable (same exec-bit pattern already used for the bundled `uv`),
  then downloads the GGUF model + mmproj via streaming `reqwest` GETs into
  the app-data cache dir, writing progress into a new shared-state slot (see
  below) as bytes arrive. Simpler than MLX's variant: no pip install, no
  Python interpreter to manage.
- **aarch64 `spawn_server`**: unchanged — spawns `mlx_server.py` via the
  venv's Python.
- **x86_64 `spawn_server`**: spawns the bundled `llama-server` binary
  directly with `-m <model.gguf> --mmproj <mmproj.gguf> --port <port> --host
  127.0.0.1` (exact flags, context size, and thread count are implementation
  details for the plan). No `--parent-pid` watchdog flag exists on the
  upstream binary — see Risks for how orphan-process handling differs from
  MLX's.

### 5. Setup progress tracking (new, engine-neutral)

To satisfy decision 4 ("the same progress percentage the UI already renders
for MLX") without changing the `mlx_status` command's `{phase, progress}`
wire shape or the `health(port)` signature: `MlxServer` (name kept as-is,
see below) gains one new field, `download_progress: Mutex<Option<f64>>`.

- On x86_64, `build_env` writes bytes-downloaded/Content-Length into this
  field as it streams the model files. `mlx_status`'s existing
  `SetupPhase::BuildingEnv` arm (currently always `("preparing".to_string(),
  None)`) reads this field and returns it as progress instead of a hardcoded
  `None`.
- On aarch64, `build_env` never touches the field, so it stays `None` and
  `mlx_status` behaves exactly as it does today (`BuildingEnv` reports flat
  "preparing" with no progress bar — venv build has none today either).

This keeps `mlx_status` itself un-arch-gated (it stays in `lib.rs`, always
compiled) while giving x86_64 a real download progress bar during the phase
that corresponds to MLX's model-download phase, just moved a step earlier in
the sequence (before spawn, not after).

### 6. Frontend

Zero changes. The status command's `{phase, progress}` shape is identical on
both architectures.

### 7. Naming

Keep existing names as-is: `MlxServer` struct, `SetupPhase`/`ServerStatus`
enums, `mlx_status` command name — renaming them is pure hygiene, not
correctness, and is explicitly cut for YAGNI. One small fix worth doing: the
`mlx-server.log` filename becomes engine-neutral (`engine-server.log`) so
field logs on Intel don't say "mlx" while containing `llama-server` output.

---

## Data Flow

Unchanged at the command layer. `capture_and_extract` and `re_extract` still
base64-encode the captured PNG in Rust and call `engine::extract_from_image`;
neither command nor the frontend needs to know which engine is compiled in.
The only architectural difference is *when* the model becomes available:

1. **aarch64:** `build_env` (fast, no download) → `spawn_server` (starts
   `mlx_server.py`, which downloads+loads the model lazily on its own worker
   thread, self-reporting `downloading`/`loading`/`ready` via `/health`).
2. **x86_64:** `build_env` (slow — downloads the GGUF + mmproj directly,
   reporting progress via the new `download_progress` field) → `spawn_server`
   (starts `llama-server` pointed at the now-local files, which only needs to
   `loading model` → `ok`, a much shorter window than MLX's in-process
   download+load).

---

## Bundling

Both `resources/uv` (MLX path) and a new `resources/llama-server` binary are
bundled **unconditionally in every build**, matching the existing acceptance
in `tauri.conf.json`'s `bundle.resources` list — Tauri's per-arch resource
config isn't worth fighting for a resource that's a few MB and simply goes
unused on the other architecture. `resources/mlx_server.py` and
`resources/requirements.lock` stay MLX-only; nothing new is needed for
`llamacpp.rs` beyond the `llama-server` binary itself (the model files are
downloaded at runtime, not bundled).

---

## Error Handling

Mirrors the MLX contract shape end to end — every failure surfaces as a
clean, user-readable string, never a hang:

- **`llama-server` binary not executable / missing:** fail fast during
  `build_env`, same pattern as the bundled `uv` exec-bit check.
- **Model download fails** (network): `build_env` returns `Err`, surfaced by
  `spawn_setup` the same way an MLX venv/pip failure is today — onboarding
  shows a retry.
- **`llama-server` fails to start or crashes on load:** `spawn_server`
  returns `Err`, or the readiness poll's `unreachable_grace` window expires —
  same "lost contact" message path already in `lib.rs`'s `spawn_setup`.
- **`/health` reports an error status:** mapped to `ServerStatus::Error`,
  same downstream handling as MLX's `Error` status.
- **`/v1/chat/completions` request fails or 5xxs:** `extract_from_image`
  returns `Err(String)`, same contract as `mlx::extract_from_image` — the
  frontend's existing extract-error handling needs no changes.

---

## Testing

- **Rust unit tests** (native, on any dev machine): `llamacpp.rs`'s
  `/health` status-string mapping (`"ok"` → `Ready`, `"loading model"` →
  `Loading`, unknown → sensible fallback) and its chat-completions
  response-parsing helper, following the same table-driven style as
  `mlx.rs`'s existing `health_deserializes_*` tests. `prompts.rs` keeps the
  existing `prompt_for` tests verbatim (module moved, behavior unchanged).
  These compile and run on any host since they don't touch
  `#[cfg(target_arch)]`-gated code paths beyond what the host arch already
  builds.
- **CI integration test (Intel-only, `runs-on: macos-13`):** native
  `x86_64` build (`cargo build`/`cargo test` directly, no cross-compilation).
  A dedicated integration test downloads the real MiniCPM-V 2.6 GGUF +
  mmproj (cached via `actions/cache` keyed on the file URL), spawns the real
  `llama-server`, waits for `/health` to report ready, and runs a real
  extraction against a bundled fixture image (a table or code screenshot),
  asserting the output has the expected structure (e.g. contains a Markdown
  table separator or a fenced code block). Triggered on `workflow_dispatch` +
  path-filtered to llama.cpp-related files, matching
  `release-macos.yml`'s dispatch-only pattern.
- **Manual verification:** fresh-install simulation on real Intel Mac
  hardware — wipe app-data, launch, confirm onboarding shows download
  progress → loading → ready, then capture and confirm structured output on
  the clipboard, for at least one table screenshot and one code screenshot.

---

## Risks & Trade-offs

- **CPU-only inference on Intel will be slow.** No GPU acceleration in this
  MVP (explicit non-goal). Generation latency is expected to be
  meaningfully worse than MLX on comparable Apple Silicon. Accepted —
  Intel Mac support existing at all is the win being pursued here, not
  matching MLX's speed.
- **`llama-server` has no built-in parent-death watchdog.**
  `mlx_server.py` self-terminates when Beaver's PID disappears via a
  `--parent-pid` polling thread (protects against orphaned processes after a
  crash/force-quit, since the normal `RunEvent::Exit` child-kill only fires
  on a clean shutdown). The upstream `llama-server` binary has no equivalent
  flag. A Beaver crash on Intel could leave an orphaned `llama-server`
  process running. Accepted as a known limitation for this spec — revisit
  (e.g. a lightweight wrapper process, or `setsid`-style process-group
  cleanup) if it proves to be a real-world problem after shipping.
  **Flagging this explicitly since it's a genuine behavior gap from MLX, not
  a re-litigation of the "no Python" decision.**
- **Model quality/speed is a best-current-guess, not committed.** MiniCPM-V
  2.6 is unvalidated against Beaver's actual table/code corpus as of this
  spec. The plan's first task must validate it before anything else is built
  on top; Qwen2-VL GGUF is the documented fallback.
- **Bundling an unused binary on the other architecture.** `llama-server`
  ships in aarch64 builds (unused) and `uv` ships in x86_64 builds (unused) —
  a small, deliberate simplicity trade-off over fighting Tauri's per-arch
  resource config.
- **First-run download time on Intel** is a new multi-GB, multi-minute wait
  (GGUF + mmproj), same order of magnitude as MLX's first-run venv+model
  cost today. No new risk class, just a different first-run bottleneck.

---

## Open questions for the plan

- Exact GGUF quantization level for MiniCPM-V 2.6 (balance of speed, quality,
  and download size) — resolved by the validation task.
- Exact Hugging Face URLs for the model + mmproj GGUF files.
- Exact `llama-server` startup flags (context size, thread count, batch
  size).
- Exact `/health` response shape for the pinned `llama-server` version (the
  loading/ready status strings) and which llama.cpp release/tag to pin — the
  project moves fast and endpoint shapes have shifted across releases.
- Whether the orphan-process gap (no parent-death watchdog) needs mitigating
  now or can genuinely wait — leaning toward "wait," per Risks above, but the
  plan should make the call explicit.
- Confirm `macos-13` is still an available Intel GitHub-hosted runner label
  at implementation time (GH reshuffles runner images regularly).
