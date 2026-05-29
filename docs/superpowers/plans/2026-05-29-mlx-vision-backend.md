# MLX Vision Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Osprey's Ollama vision backend with a persistent, Rust-supervised local MLX vision server so the app fits comfortably on a 16 GB Apple Silicon Mac (~1.6 GB resident vs ~10.5 GiB).

**Architecture:** A small Python FastAPI server (`mlx_server.py`) loads `mlx-community/Qwen2.5-VL-3B-Instruct-4bit` once and exposes `GET /health` + `POST /extract` on a localhost port. The Rust core builds a Python venv on first run using a bundled `uv` binary, spawns the server as a `std::process::Child` held in managed state, polls it to readiness, and kills it on app exit. The existing capture → extract → clipboard flow and the frontend command contract are unchanged.

**Tech Stack:** Tauri 2 (Rust), React 19 + Vite + TypeScript, Python 3.12 + FastAPI/uvicorn + mlx-vlm 0.5.0, `uv` for environment provisioning. Apple Silicon only.

---

## Context the implementer needs

- **Repo:** `/Users/thomasindrias/osprey` (NOTE: the shell cwd may be `/Users/thomasindrias/djtl` — always `cd /Users/thomasindrias/osprey` first).
- **This is a macOS menu-bar (tray) Tauri app.** `tauri.conf.json` has `"windows": []`; windows are created at runtime in `src-tauri/src/lib.rs` (`popover`, `capture-overlay`, `onboarding`).
- **The model is already cached** during prior benchmarking at the user's default HF cache. The plan routes the server's cache to a self-contained `HF_HOME` under the app data dir, so first run will re-download (~2.9 GB on disk). This is intentional for a clean, uninstall-friendly layout.
- **A working reference venv** exists at `/tmp/mlx-bench-venv` (Python 3.12, mlx-vlm 0.5.0, fastapi 0.136.3, uvicorn 0.48.0). The `generate(model, processor, formatted, image=[path], max_tokens=1024)` call and `apply_chat_template(processor, config, prompt, num_images=1)` are validated against this version.
- **The `uv` binary** is at `/Users/thomasindrias/.local/bin/uv` (Mach-O arm64, 45.5 MB).
- **Run all commands from the repo root** unless stated. Rust tests: `cd src-tauri && cargo test`. Frontend tests: `pnpm test:run` (one-shot; `pnpm test` is vitest **watch** mode and won't exit). Dev run: `pnpm tauri dev`.
- **Do NOT commit** unless the plan step says so; each task ends with an explicit commit step (the user authorized commits as part of executing this plan on a feature branch).

## File Structure

**New files:**
- `src-tauri/resources/mlx_server.py` — Python FastAPI vision server (bundled resource). One job: load the model once, serve `/health` and `/extract`.
- `src-tauri/resources/requirements.txt` — pinned Python deps for the venv (bundled resource).
- `src-tauri/resources/uv` — the `uv` binary (bundled resource, copied from the user's install).
- `src-tauri/resources/test_mlx_server.py` — standalone test for the server's pure logic (NOT bundled).
- `src-tauri/src/mlx.rs` — Rust HTTP client for the server (`api_url`, `health`, `extract_from_image`, status types). Replaces the client half of `ollama.rs`.
- `src-tauri/src/server.rs` — Rust process/environment management (free-port selection, path resolution, env build via `uv`, server spawn, `MlxServer` managed state). Replaces the lifecycle half of `ollama.rs`.

**Modified files:**
- `src-tauri/src/lib.rs` — wire setup (env build + spawn + readiness poller), swap commands, add `RunEvent::Exit` kill hook, remove all Ollama references.
- `src-tauri/tauri.conf.json` — add `bundle.resources`, remove `bundle.externalBin`.
- `src-tauri/entitlements.plist` — add hardened-runtime entitlements for the embedded Python/Metal.
- `src/components/ModelDownload.tsx` — poll `mlx_status` instead of streaming Ollama pull progress.
- `src/components/Onboarding.tsx` — copy tweaks only.

**Deleted files:**
- `src-tauri/src/ollama.rs`
- `src-tauri/binaries/ollama-aarch64-apple-darwin`, `src-tauri/binaries/ollama-x86_64-apple-darwin` (and the now-empty `binaries/` dir).

---

### Task 1: Feature branch + bundled assets + bundle config

**Files:**
- Create: `src-tauri/resources/uv`, `src-tauri/resources/requirements.txt`
- Modify: `src-tauri/tauri.conf.json`, `src-tauri/entitlements.plist`

- [ ] **Step 1: Create the feature branch**

```bash
cd /Users/thomasindrias/osprey
git checkout -b feature/mlx-vision-backend
```

- [ ] **Step 2: Copy the `uv` binary into resources and add pinned requirements**

```bash
cd /Users/thomasindrias/osprey
mkdir -p src-tauri/resources
cp /Users/thomasindrias/.local/bin/uv src-tauri/resources/uv
chmod +x src-tauri/resources/uv
file src-tauri/resources/uv   # expect: Mach-O 64-bit executable arm64
```

Create `src-tauri/resources/requirements.txt`:

```
mlx-vlm==0.5.0
```

- [ ] **Step 3: Update `tauri.conf.json` bundle config**

In `src-tauri/tauri.conf.json`, replace the `"externalBin": ["binaries/ollama"]` line inside `bundle` with a `resources` array. The `bundle` block becomes:

```json
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "entitlements": "entitlements.plist",
      "infoPlist": "Info.plist"
    },
    "resources": [
      "resources/uv",
      "resources/mlx_server.py",
      "resources/requirements.txt"
    ]
  },
```

- [ ] **Step 4: Add hardened-runtime entitlements for the embedded Python/Metal**

Replace `src-tauri/entitlements.plist` with:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.screen-recording</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
</dict>
</plist>
```

These let the notarized, hardened-runtime release load the venv's unsigned dylibs and MLX's runtime-compiled Metal kernels. They have no effect on `tauri dev`.

- [ ] **Step 5: Verify the build still configures (no Rust changes yet)**

```bash
cd /Users/thomasindrias/osprey/src-tauri && cargo check
```
Expected: compiles (Ollama code still present and untouched).

- [ ] **Step 6: Commit**

```bash
cd /Users/thomasindrias/osprey
git add src-tauri/resources/uv src-tauri/resources/requirements.txt src-tauri/tauri.conf.json src-tauri/entitlements.plist
git commit -m "chore: bundle uv + requirements, add MLX entitlements"
```

---

### Task 2: Python MLX vision server

**Files:**
- Create: `src-tauri/resources/mlx_server.py`
- Test: `src-tauri/resources/test_mlx_server.py`

- [ ] **Step 1: Create a lightweight test venv (import-time deps only)**

The server imports `fastapi`, `pydantic`, `uvicorn` at module load; `mlx`/`huggingface_hub` are imported lazily inside functions, so the test needs only the three light deps.

```bash
/Users/thomasindrias/.local/bin/uv venv /tmp/osprey-pytest-venv --python 3.12
/Users/thomasindrias/.local/bin/uv pip install --python /tmp/osprey-pytest-venv/bin/python fastapi uvicorn pydantic
```

- [ ] **Step 2: Write the failing test**

Create `src-tauri/resources/test_mlx_server.py`:

```python
import mlx_server as m


def test_health_reflects_state():
    m.STATE["status"] = "downloading"
    m.STATE["progress"] = None
    assert m.health() == {"status": "downloading", "progress": None}
    m.STATE["status"] = "ready"
    assert m.health()["status"] == "ready"


def test_extract_raises_503_when_not_ready():
    from fastapi import HTTPException
    m.STATE["status"] = "loading"
    try:
        m.extract(m.ExtractReq(image_base64="aGk=", prompt="x"))
        raise AssertionError("expected HTTPException")
    except HTTPException as e:
        assert e.status_code == 503


if __name__ == "__main__":
    test_health_reflects_state()
    test_extract_raises_503_when_not_ready()
    print("OK")
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/thomasindrias/osprey/src-tauri/resources && /tmp/osprey-pytest-venv/bin/python test_mlx_server.py
```
Expected: FAIL with `ModuleNotFoundError: No module named 'mlx_server'`.

- [ ] **Step 4: Write the server**

Create `src-tauri/resources/mlx_server.py`:

```python
"""Osprey MLX vision server.

Loads Qwen2.5-VL-3B-Instruct-4bit once and exposes:
  GET  /health  -> {"status": "downloading"|"loading"|"ready"|"error", "progress": float|None}
  POST /extract -> {"markdown": str}

Heavy imports (mlx, huggingface_hub) are deferred into functions so the module
imports cheaply for tests and so /health is serveable before the model loads.
"""
import argparse
import base64
import os
import tempfile
import threading

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_REPO = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"

STATE = {"status": "loading", "progress": None}
_model = None
_processor = None
_config = None
# Serialize inference: MLX model state isn't safe for concurrent generate()
# calls, and the global shortcut can fire two captures in quick succession.
_infer_lock = threading.Lock()

app = FastAPI()


class ExtractReq(BaseModel):
    image_base64: str
    prompt: str


@app.get("/health")
def health():
    return {"status": STATE["status"], "progress": STATE["progress"]}


@app.post("/extract")
def extract(req: ExtractReq):
    if STATE["status"] != "ready":
        raise HTTPException(status_code=503, detail="model not ready")

    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template

    img_bytes = base64.b64decode(req.image_base64)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(img_bytes)
        path = f.name
    try:
        with _infer_lock:
            formatted = apply_chat_template(_processor, _config, req.prompt, num_images=1)
            result = generate(
                _model, _processor, formatted, image=[path], max_tokens=1024, verbose=False
            )
        text = result if isinstance(result, str) else (getattr(result, "text", None) or str(result))
        return {"markdown": text.strip()}
    except Exception as e:  # surface model errors as a clean 500
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(path)


def load_model():
    global _model, _processor, _config
    try:
        from huggingface_hub import snapshot_download

        STATE["status"] = "downloading"
        local_path = snapshot_download(MODEL_REPO)

        STATE["status"] = "loading"
        from mlx_vlm import load

        _model, _processor = load(local_path)
        _config = getattr(_model, "config", None)
        STATE["status"] = "ready"
    except Exception as e:  # leave a diagnosable state
        STATE["status"] = "error"
        STATE["progress"] = None
        print(f"mlx_server: model load failed: {e}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    threading.Thread(target=load_model, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/thomasindrias/osprey/src-tauri/resources && /tmp/osprey-pytest-venv/bin/python test_mlx_server.py
```
Expected: prints `OK`.

- [ ] **Step 6: Commit**

```bash
cd /Users/thomasindrias/osprey
git add src-tauri/resources/mlx_server.py src-tauri/resources/test_mlx_server.py
git commit -m "feat: add MLX vision server (FastAPI) with health/extract"
```

---

### Task 3: Rust HTTP client (`mlx.rs`)

**Files:**
- Create: `src-tauri/src/mlx.rs`
- Modify: `src-tauri/src/lib.rs:1-4` (add `mod mlx;`)

- [ ] **Step 1: Register the module and write failing tests**

In `src-tauri/src/lib.rs`, add `mod mlx;` to the module declarations at the top (lines 1-4):

```rust
mod capture;
mod db;
mod mlx;
mod ollama;
mod shortcut;
```

Create `src-tauri/src/mlx.rs` with only the test module first (so it fails to compile against missing items):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_url_builds_with_port() {
        assert_eq!(api_url(11500, "/health"), "http://127.0.0.1:11500/health");
    }

    #[test]
    fn health_deserializes_ready_with_null_progress() {
        let h: HealthStatus = serde_json::from_str(r#"{"status":"ready","progress":null}"#).unwrap();
        assert_eq!(h.status, ServerStatus::Ready);
        assert_eq!(h.progress, None);
    }

    #[test]
    fn health_deserializes_downloading_without_progress_field() {
        let h: HealthStatus = serde_json::from_str(r#"{"status":"downloading"}"#).unwrap();
        assert_eq!(h.status, ServerStatus::Downloading);
        assert_eq!(h.progress, None);
    }

    #[test]
    fn health_deserializes_error_status() {
        let h: HealthStatus = serde_json::from_str(r#"{"status":"error","progress":null}"#).unwrap();
        assert_eq!(h.status, ServerStatus::Error);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/thomasindrias/osprey/src-tauri && cargo test --lib mlx
```
Expected: FAIL to compile — `api_url`, `HealthStatus`, `ServerStatus` not found.

- [ ] **Step 3: Implement the client**

Prepend the implementation above the test module in `src-tauri/src/mlx.rs`:

```rust
use std::time::Duration;

pub const MODEL_REPO: &str = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit";

pub const EXTRACTION_PROMPT: &str =
    "Extract all data visible in this image. Return as Markdown only. \
     Preserve structure exactly: tables as Markdown tables, lists as Markdown lists, \
     code in fenced code blocks with language hints. \
     Output only the extracted content — no commentary or explanation.";

pub fn api_url(port: u16, path: &str) -> String {
    format!("http://127.0.0.1:{port}{path}")
}

#[derive(serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Downloading,
    Loading,
    Ready,
    Error,
}

#[derive(serde::Deserialize, Debug)]
pub struct HealthStatus {
    pub status: ServerStatus,
    #[serde(default)]
    pub progress: Option<f64>,
}

/// GET /health. `Err` means the server isn't reachable yet (still starting).
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
    resp.error_for_status()
        .map_err(|e| e.to_string())?
        .json::<HealthStatus>()
        .await
        .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct ExtractResponse {
    markdown: String,
}

/// POST /extract. Returns the extracted Markdown, or a user-readable error
/// string. A 503 here means the model is still loading.
pub async fn extract_from_image(port: u16, image_base64: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let body = serde_json::json!({
        "image_base64": image_base64,
        "prompt": EXTRACTION_PROMPT,
    });
    let resp = client
        .post(api_url(port, "/extract"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("MLX request failed: {e}"))?;
    let result: ExtractResponse = resp
        .error_for_status()
        .map_err(|e| format!("MLX server error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse MLX response: {e}"))?;
    Ok(result.markdown.trim().to_string())
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/thomasindrias/osprey/src-tauri && cargo test --lib mlx
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/thomasindrias/osprey
git add src-tauri/src/mlx.rs src-tauri/src/lib.rs
git commit -m "feat: add mlx.rs HTTP client for the vision server"
```

---

### Task 4: Server lifecycle module (`server.rs`)

**Files:**
- Create: `src-tauri/src/server.rs`
- Modify: `src-tauri/src/lib.rs:1-5` (add `mod server;`)

- [ ] **Step 1: Register the module and write the failing test**

In `src-tauri/src/lib.rs`, add `mod server;` to the module list:

```rust
mod capture;
mod db;
mod mlx;
mod ollama;
mod server;
mod shortcut;
```

Create `src-tauri/src/server.rs` with the test module only:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_port_returns_a_bindable_port() {
        let port = free_port().expect("should find a free port");
        assert!(port > 0);
        // The helper must release the port so the caller can bind it.
        let listener = std::net::TcpListener::bind(("127.0.0.1", port)).expect("port is free");
        drop(listener);
    }

    #[test]
    fn free_port_returns_distinct_ports_usually() {
        // Not guaranteed distinct, but two sequential calls should both succeed.
        let a = free_port().unwrap();
        let b = free_port().unwrap();
        assert!(a > 0 && b > 0);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/thomasindrias/osprey/src-tauri && cargo test --lib server
```
Expected: FAIL to compile — `free_port` not found.

- [ ] **Step 3: Implement the lifecycle module**

Prepend above the test module in `src-tauri/src/server.rs`:

```rust
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::Manager;

/// Where the app keeps its self-contained MLX environment + model cache.
/// Everything lives under the Tauri app-data dir so uninstall is clean.
const VENV_DIRNAME: &str = "mlx-venv";
const HF_DIRNAME: &str = "hf-cache";
const UV_CACHE_DIRNAME: &str = "uv-cache";
const UV_PYTHON_DIRNAME: &str = "uv-python";

/// Coarse setup phase tracked on the Rust side. The fine-grained
/// downloading/loading/ready states come from the server's /health.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SetupPhase {
    BuildingEnv,
    StartingServer,
    ServerUp,
    Failed,
}

/// Managed app state: the localhost port, the server child handle, and the
/// current setup phase.
pub struct MlxServer {
    pub port: u16,
    pub child: Mutex<Option<Child>>,
    pub phase: Mutex<SetupPhase>,
}

/// Bind to port 0 to let the OS pick a free port, then drop the listener so the
/// port is available for the server to claim. Localhost-only; the tiny TOCTOU
/// window is acceptable here.
pub fn free_port() -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    Ok(port)
}

fn app_data(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir must resolve")
}

pub fn venv_python(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(VENV_DIRNAME).join("bin").join("python")
}

pub fn hf_home(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(HF_DIRNAME)
}

pub fn env_is_ready(app: &tauri::AppHandle) -> bool {
    venv_python(app).exists()
}

/// Marker written after the server first reaches `ready`. This is the source of
/// truth for "setup has completed at least once" — more reliable than probing
/// the HF cache dir, which exists mid-download (an interrupted first run would
/// otherwise look complete and skip the onboarding progress UI).
pub fn setup_marker(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(".setup-complete")
}

pub fn setup_is_complete(app: &tauri::AppHandle) -> bool {
    setup_marker(app).exists()
}

pub fn mark_setup_complete(app: &tauri::AppHandle) {
    if let Err(e) = std::fs::write(setup_marker(app), b"1") {
        eprintln!("Osprey: failed to write setup marker: {e}");
    }
}

/// Resolve a bundled resource. In debug builds resources aren't copied to a
/// bundle, so read them from the crate's `resources/` dir; in release read from
/// the app's resource dir.
pub fn resolve_resource(app: &tauri::AppHandle, name: &str) -> PathBuf {
    if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(name)
    } else {
        app.path()
            .resource_dir()
            .expect("resource dir must resolve")
            .join("resources")
            .join(name)
    }
}

fn uv_command(app: &tauri::AppHandle) -> Command {
    let uv = resolve_resource(app, "uv");
    // Resource copies don't always keep the exec bit; force it.
    if let Ok(meta) = std::fs::metadata(&uv) {
        let mut perms = meta.permissions();
        perms.set_mode(0o755);
        let _ = std::fs::set_permissions(&uv, perms);
    }
    let data = app_data(app);
    let mut cmd = Command::new(uv);
    // Keep uv's downloaded Pythons and cache inside the app-data dir.
    cmd.env("UV_CACHE_DIR", data.join(UV_CACHE_DIRNAME));
    cmd.env("UV_PYTHON_INSTALL_DIR", data.join(UV_PYTHON_DIRNAME));
    cmd
}

/// Build the Python venv and install mlx-vlm into it. Blocking; run off the
/// main thread. Idempotent enough to re-run after a partial failure.
pub fn build_env(app: &tauri::AppHandle) -> Result<(), String> {
    let data = app_data(app);
    std::fs::create_dir_all(&data).map_err(|e| format!("create app data dir: {e}"))?;

    let venv = data.join(VENV_DIRNAME);
    let create = uv_command(app)
        .args(["venv", "--python", "3.12"])
        .arg(&venv)
        .output()
        .map_err(|e| format!("uv venv spawn failed: {e}"))?;
    if !create.status.success() {
        return Err(format!(
            "uv venv failed: {}",
            String::from_utf8_lossy(&create.stderr)
        ));
    }

    let req = resolve_resource(app, "requirements.txt");
    let install = uv_command(app)
        .args(["pip", "install", "--python"])
        .arg(venv_python(app))
        .arg("-r")
        .arg(&req)
        .output()
        .map_err(|e| format!("uv pip install spawn failed: {e}"))?;
    if !install.status.success() {
        return Err(format!(
            "uv pip install failed: {}",
            String::from_utf8_lossy(&install.stderr)
        ));
    }
    Ok(())
}

/// Spawn the MLX server using the venv's Python, with HF_HOME pinned to the
/// app-data cache. Returns the child handle to be held in managed state.
pub fn spawn_server(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let python = venv_python(app);
    let script = resolve_resource(app, "mlx_server.py");
    Command::new(python)
        .arg(script)
        .arg("--port")
        .arg(port.to_string())
        .env("HF_HOME", hf_home(app))
        .spawn()
        .map_err(|e| format!("failed to spawn MLX server: {e}"))
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/thomasindrias/osprey/src-tauri && cargo test --lib server
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/thomasindrias/osprey
git add src-tauri/src/server.rs src-tauri/src/lib.rs
git commit -m "feat: add server.rs (venv build, free port, server spawn)"
```

---

### Task 5: Wire `lib.rs` to MLX and remove Ollama wiring

**Files:**
- Modify: `src-tauri/src/lib.rs` (setup block, commands, run loop)

This task rewrites the Ollama-specific parts of `lib.rs`. The popover/tray/overlay window code (lines 203-354 except the `warm_model` call) stays unchanged.

- [ ] **Step 1: Remove the `OllamaChild` struct and its import usage**

Delete these lines near the top of `src-tauri/src/lib.rs` (the struct at lines 16-17):

```rust
#[allow(dead_code)]
struct OllamaChild(Mutex<Option<CommandChild>>);
```

Delete the entire `tauri_plugin_shell` import line (line 13). The sidecar (removed in Step 2) was its only consumer, so both `ShellExt` and `process::CommandChild` are now unused:

```rust
// DELETE this line entirely:
use tauri_plugin_shell::{process::CommandChild, ShellExt};
```

(The `tauri_plugin_shell::init()` plugin registration is left in place here and removed fully — along with the Cargo dep, capability, and config — in Task 7.)

- [ ] **Step 2: Replace the setup block's Ollama sidecar + readiness section**

In the `.setup(|app| { ... })` closure, replace everything from the comment `// Start Ollama sidecar` (line 80) through the end of the readiness `std::thread::spawn` block (line 130) — i.e. lines 80-130 — with:

```rust
            // Pick a free localhost port and register server state up front so
            // commands can read it immediately.
            let port = server::free_port().unwrap_or(11500);
            app.manage(server::MlxServer {
                port,
                child: Mutex::new(None),
                phase: Mutex::new(server::SetupPhase::BuildingEnv),
            });

            // Build the venv (first run only), spawn the server, and poll it to
            // readiness — all off the main thread so the tray is usable at once.
            // Show onboarding immediately when the model isn't cached yet, so the
            // user watches setup progress instead of a blank app.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let state = handle.state::<server::MlxServer>();
                let first_launch = !server::setup_is_complete(&handle);

                if first_launch {
                    let h = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        let result = tauri::WebviewWindowBuilder::new(
                            &h,
                            "onboarding",
                            tauri::WebviewUrl::App("/".into()),
                        )
                        .title("Welcome to Osprey")
                        .inner_size(480.0, 540.0)
                        .center()
                        .build();
                        if let Err(e) = result {
                            eprintln!("Osprey: failed to create onboarding window: {e}");
                        }
                    });
                }

                if !server::env_is_ready(&handle) {
                    *state.phase.lock().unwrap() = server::SetupPhase::BuildingEnv;
                    if let Err(e) = server::build_env(&handle) {
                        eprintln!("Osprey: MLX env build failed: {e}");
                        *state.phase.lock().unwrap() = server::SetupPhase::Failed;
                        return;
                    }
                }

                *state.phase.lock().unwrap() = server::SetupPhase::StartingServer;
                match server::spawn_server(&handle, state.port) {
                    Ok(child) => {
                        *state.child.lock().unwrap() = Some(child);
                    }
                    Err(e) => {
                        eprintln!("Osprey: failed to spawn MLX server: {e}");
                        *state.phase.lock().unwrap() = server::SetupPhase::Failed;
                        return;
                    }
                }

                // Poll to readiness. Do NOT impose a wall-clock deadline while the
                // server is reachable and reports progress — the first run can
                // download a few hundred MB of deps plus a ~3 GB model on a slow
                // link. Only fail if the server stays UNREACHABLE for a sustained
                // window (the process likely died), with a generous absolute cap
                // as a final backstop.
                let started = std::time::Instant::now();
                let mut last_reachable = std::time::Instant::now();
                let unreachable_grace = std::time::Duration::from_secs(60);
                let absolute_cap = std::time::Duration::from_secs(3600);
                loop {
                    match tauri::async_runtime::block_on(mlx::health(state.port)) {
                        Ok(h) => {
                            last_reachable = std::time::Instant::now();
                            match h.status {
                                mlx::ServerStatus::Ready => {
                                    *state.phase.lock().unwrap() = server::SetupPhase::ServerUp;
                                    server::mark_setup_complete(&handle);
                                    break;
                                }
                                mlx::ServerStatus::Error => {
                                    *state.phase.lock().unwrap() = server::SetupPhase::Failed;
                                    break;
                                }
                                // downloading / loading — keep waiting.
                                _ => {}
                            }
                        }
                        Err(_) => {
                            if last_reachable.elapsed() > unreachable_grace {
                                eprintln!("Osprey: MLX server unreachable — giving up");
                                *state.phase.lock().unwrap() = server::SetupPhase::Failed;
                                break;
                            }
                        }
                    }
                    if started.elapsed() > absolute_cap {
                        eprintln!("Osprey: MLX server setup exceeded the time cap");
                        *state.phase.lock().unwrap() = server::SetupPhase::Failed;
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            });
```

- [ ] **Step 3: Replace the `invoke_handler` command list**

Change line 134 to drop the Ollama commands and add `mlx_status`:

```rust
        .invoke_handler(tauri::generate_handler![
            capture_and_extract,
            mlx_status,
            write_to_clipboard,
            show_success_notification,
            is_first_launch
        ])
```

- [ ] **Step 4: Replace the run loop so the server child is killed on exit**

Replace line 135 (`.run(tauri::generate_context!())` and its `.expect(...)`) with a build + run-with-handler that kills the child on `Exit`:

```rust
        .build(tauri::generate_context!())
        .expect("error while building Osprey")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<server::MlxServer>() {
                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
```

- [ ] **Step 5: Replace the command implementations**

Replace the `ollama_is_running`, `model_is_installed`, `capture_and_extract`, `is_first_launch`, and `pull_model` command functions (lines 139-201) with:

```rust
#[tauri::command]
async fn mlx_status(state: tauri::State<'_, server::MlxServer>) -> Result<String, ()> {
    // Copy the cheap bits out before any await so we never hold the lock across it.
    let phase = *state.phase.lock().unwrap();
    let port = state.port;

    let label = match phase {
        server::SetupPhase::BuildingEnv => "preparing".to_string(),
        server::SetupPhase::Failed => "error".to_string(),
        server::SetupPhase::StartingServer | server::SetupPhase::ServerUp => {
            match mlx::health(port).await {
                Ok(h) => match h.status {
                    mlx::ServerStatus::Downloading => "downloading",
                    mlx::ServerStatus::Loading => "loading",
                    mlx::ServerStatus::Ready => "ready",
                    mlx::ServerStatus::Error => "error",
                }
                .to_string(),
                Err(_) => "starting".to_string(),
            }
        }
    };
    Ok(label)
}

// Capture and extract in one hop: the (multi-MB) image bytes stay in Rust and
// are base64-encoded once for the MLX server, instead of round-tripping to the
// frontend and back across the IPC boundary as a giant string.
#[tauri::command]
async fn capture_and_extract(
    region: capture::CaptureRegion,
    state: tauri::State<'_, server::MlxServer>,
) -> Result<String, String> {
    let port = state.port;
    let bytes = capture::capture_region(&region).map_err(|e| e.to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    mlx::extract_from_image(port, &image_base64).await
}

#[tauri::command]
async fn write_to_clipboard(app: tauri::AppHandle, text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
async fn show_success_notification(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title("Osprey")
        .body("Copied to clipboard.")
        .show()
        .map_err(|e| e.to_string())
}

// First launch == setup has never completed (no marker), so onboarding runs.
#[tauri::command]
async fn is_first_launch(app: tauri::AppHandle) -> bool {
    !server::setup_is_complete(&app)
}
```

- [ ] **Step 6: Verify it compiles**

```bash
cd /Users/thomasindrias/osprey/src-tauri && cargo check
```
Expected: compiles. If `ShellExt` or the `tauri_plugin_shell::init()` plugin registration is now flagged unused, leave the plugin registered (it provides `shell.open` for links) but remove the unused `use tauri_plugin_shell::ShellExt;` import if the compiler warns it is unused.

- [ ] **Step 7: Run the Rust test suite**

```bash
cd /Users/thomasindrias/osprey/src-tauri && cargo test
```
Expected: all tests pass (ollama.rs tests still present and passing — removed in Task 7).

- [ ] **Step 8: Commit**

```bash
cd /Users/thomasindrias/osprey
git add src-tauri/src/lib.rs
git commit -m "feat: wire lib.rs to MLX server; kill child on exit"
```

---

### Task 6: Frontend — poll `mlx_status` in ModelDownload

**Files:**
- Modify: `src/components/ModelDownload.tsx`
- Modify: `src/components/Onboarding.tsx` (copy only)
- Test: `src/components/ModelDownload.test.tsx` (new)

- [ ] **Step 1: Write the failing test for the phase-label mapper**

Create `src/components/ModelDownload.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { formatPhase } from "./ModelDownload";

describe("formatPhase", () => {
  it("maps known phases to human labels", () => {
    expect(formatPhase("preparing")).toBe("Preparing environment…");
    expect(formatPhase("starting")).toBe("Starting…");
    expect(formatPhase("downloading")).toBe("Downloading model…");
    expect(formatPhase("loading")).toBe("Loading model…");
    expect(formatPhase("ready")).toBe("Ready");
  });

  it("falls back to a generic label for unknown values", () => {
    expect(formatPhase("something-else")).toBe("Setting up…");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/thomasindrias/osprey && pnpm test:run ModelDownload
```
Expected: FAIL — `formatPhase` is not exported / file shape differs.
(Note: use `test:run`, not `test` — the `test` script is `vitest` in watch mode and will not exit.)

- [ ] **Step 3: Rewrite ModelDownload to poll `mlx_status`**

Replace the entire contents of `src/components/ModelDownload.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

interface Props { onComplete: () => void }

type Phase = "preparing" | "starting" | "downloading" | "loading" | "ready" | "error";

export function formatPhase(phase: string): string {
  switch (phase) {
    case "preparing": return "Preparing environment…";
    case "starting": return "Starting…";
    case "downloading": return "Downloading model…";
    case "loading": return "Loading model…";
    case "ready": return "Ready";
    default: return "Setting up…";
  }
}

export function ModelDownload({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("preparing");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const status = await invoke<string>("mlx_status");
        if (!active) return;
        setPhase(status as Phase);
        if (status === "ready") {
          onComplete();
          return;
        }
        if (status === "error") return; // stop polling; show error UI
      } catch {
        // server not up yet — keep polling
      }
      timer = setTimeout(poll, 1000);
    };

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [onComplete]);

  if (phase === "error") {
    return (
      <div className="flex w-full max-w-[340px] flex-col items-center text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-destructive/12 text-destructive">
          <AlertCircle className="size-7" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Setup didn't finish</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Osprey couldn't finish setting up its local AI. Check your internet
          connection and restart Osprey to try again.
        </p>
        <Button className="mt-6 w-full" onClick={onComplete}>
          Continue anyway
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[340px] flex-col items-center text-center">
      <Logo size={56} live className="mb-5" />
      <h2 className="text-lg font-semibold tracking-tight">Setting up your local AI</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        First run downloads a ~3&nbsp;GB vision model and prepares an on-device
        environment. This is the only time Osprey needs the internet — everything
        after runs offline.
      </p>

      <div className="mt-7 w-full">
        <div className="h-1.5 w-full animate-pulse rounded-full bg-primary/60" />
        <div className="mt-2.5 flex items-center justify-center text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Download className="size-3.5" />
            {formatPhase(phase)}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/thomasindrias/osprey && pnpm test:run ModelDownload
```
Expected: both `formatPhase` tests pass.

- [ ] **Step 5: Update Onboarding copy for on-device/Apple Silicon framing**

In `src/components/Onboarding.tsx`, the `FEATURES` array's third item currently says "No cloud, no accounts." Leave it — it's still accurate. No structural change needed. Update the welcome subtitle only if desired; otherwise no edit. (This step is a no-op confirmation that Onboarding's `welcome → download → ready` flow still drives `ModelDownload`, which now self-reports readiness via `onComplete`.)

- [ ] **Step 6: Run the full frontend test suite**

```bash
cd /Users/thomasindrias/osprey && pnpm test:run
```
Expected: all tests pass (existing CaptureOverlay/HistoryList/useOsprey tests unaffected).

- [ ] **Step 7: Commit**

```bash
cd /Users/thomasindrias/osprey
git add src/components/ModelDownload.tsx src/components/ModelDownload.test.tsx
git commit -m "feat: poll mlx_status for setup progress in onboarding"
```

---

### Task 7: Remove Ollama backend, binaries, and the now-dead shell plugin

**Files:**
- Delete: `src-tauri/src/ollama.rs`, `src-tauri/binaries/ollama-aarch64-apple-darwin`, `src-tauri/binaries/ollama-x86_64-apple-darwin`
- Modify: `src-tauri/src/lib.rs` (remove `mod ollama;` and the shell plugin registration)
- Modify: `src-tauri/Cargo.toml` (remove `tauri-plugin-shell`)
- Modify: `src-tauri/capabilities/default.json` (remove `shell:default`)
- Modify: `src-tauri/tauri.conf.json` (remove `plugins.shell`)
- Modify: `package.json` (remove `@tauri-apps/plugin-shell` — verified unused by the frontend)

The Ollama sidecar (`lib.rs:81`) was the **only** consumer of `tauri-plugin-shell`; the frontend opens links via `@tauri-apps/plugin-opener`, not the shell plugin. So the shell plugin is fully orphaned by this migration and is removed here.

- [ ] **Step 1: Confirm no remaining references to Ollama in source**

```bash
cd /Users/thomasindrias/osprey
grep -rn "ollama" src src-tauri/src src-tauri/capabilities src-tauri/tauri.conf.json 2>/dev/null
grep -rn "warm_model\|pull_model\|model_is_installed\|ollama_is_running\|OllamaChild\|OLLAMA_MAX_LOADED_MODELS\|model-pull-progress" src src-tauri/src 2>/dev/null
```
Expected: the only hits are `mod ollama;` in `lib.rs` and matches inside `ollama.rs` itself. If the frontend (`src/`) has any hit (e.g. an old `listen("model-pull-progress")`), it was removed in Task 6 — re-check and fix before deleting.

Note on intentionally dropped tests: `ollama.rs` contained `#[cfg(test)]`-only `detect_content_type` / `has_table_separator` helpers and their unit tests. These were never called by production code (the real content-type detection lives in `src/hooks/useOsprey.ts` and is covered by frontend tests). They are deliberately dropped, not ported — do not recreate them in `mlx.rs`.

- [ ] **Step 2: Remove the module declaration**

In `src-tauri/src/lib.rs`, delete the `mod ollama;` line so the module list reads:

```rust
mod capture;
mod db;
mod mlx;
mod server;
mod shortcut;
```

- [ ] **Step 3: Delete the Ollama files**

```bash
cd /Users/thomasindrias/osprey
git rm src-tauri/src/ollama.rs
git rm src-tauri/binaries/ollama-aarch64-apple-darwin src-tauri/binaries/ollama-x86_64-apple-darwin
rmdir src-tauri/binaries 2>/dev/null || true
```

- [ ] **Step 4: Remove the now-dead shell plugin**

First confirm the frontend never imports it (expect no output):

```bash
cd /Users/thomasindrias/osprey
grep -rn "plugin-shell" src/ package.json
```
Expect: only the `package.json` dependency line (no `src/` import). If `src/` has a hit, stop and reassess — something still uses it.

Then remove all four pieces:

1. In `src-tauri/src/lib.rs`, delete the plugin registration line in the `tauri::Builder` chain:

```rust
        .plugin(tauri_plugin_shell::init())
```

2. In `src-tauri/Cargo.toml`, delete the dependency line:

```toml
tauri-plugin-shell = "2.3.5"
```

3. In `src-tauri/capabilities/default.json`, delete the `"shell:default",` entry from the `permissions` array.

4. In `src-tauri/tauri.conf.json`, remove the `shell` entry from `plugins`. Since it's the only plugin entry, the block becomes:

```json
  "plugins": {}
```

5. In `package.json`, delete the `"@tauri-apps/plugin-shell": "^2.3.5",` dependency line, then refresh the lockfile:

```bash
cd /Users/thomasindrias/osprey && pnpm install
```

- [ ] **Step 5: Verify the workspace compiles and tests pass**

```bash
cd /Users/thomasindrias/osprey/src-tauri && cargo check && cargo test
```
Expected: compiles clean; all remaining tests pass (capture, db, mlx, server).

```bash
cd /Users/thomasindrias/osprey && pnpm test:run
```
Expected: all frontend tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/thomasindrias/osprey
git add -A
git commit -m "refactor: remove Ollama backend, binaries, and dead shell plugin"
```

---

### Task 8: Manual end-to-end verification

No code changes — this validates the full first-run and warm-run behavior. UI/feature correctness can't be proven by unit tests here, so this manual pass is required.

- [ ] **Step 1: Simulate a clean first run**

```bash
# Remove the app's self-contained env + model cache + setup marker so first-run
# setup triggers. Leaves the SQLite capture history intact.
rm -rf "$HOME/Library/Application Support/se.djtl.osprey/mlx-venv" \
       "$HOME/Library/Application Support/se.djtl.osprey/hf-cache" \
       "$HOME/Library/Application Support/se.djtl.osprey/uv-cache" \
       "$HOME/Library/Application Support/se.djtl.osprey/uv-python"
rm -f  "$HOME/Library/Application Support/se.djtl.osprey/.setup-complete"
```

- [ ] **Step 2: Launch the dev build and watch setup**

```bash
cd /Users/thomasindrias/osprey && pnpm tauri dev
```
Expected, in order:
1. Onboarding window appears (model not cached).
2. Click "Get started" → ModelDownload shows phases progressing: `Preparing environment…` → `Downloading model…` → `Loading model…` → onboarding advances to the "You're all set" step (driven by `onComplete` when `mlx_status` returns `ready`).
3. First run takes a few minutes (venv build + ~3 GB download). Subsequent runs skip straight to `loading` → `ready` in seconds.

- [ ] **Step 3: Verify a capture works end-to-end**

- Press ⌘⇧D, drag a region over some text/table.
- Expected: a "Copied to clipboard." notification fires; pasting yields structured Markdown.
- Open the tray popover: the new capture appears in history (focus-refresh from the existing TrayPopover behavior).

- [ ] **Step 4: Verify memory footprint**

```bash
ps -Ao rss,comm | grep -i python | grep -v grep | awk '{s+=$1} END {printf "Python RSS: %.2f GB\n", s/1048576}'
```
Expected: roughly ~1.6 GB resident for the server process (vs ~10.5 GiB under Ollama).

- [ ] **Step 5: Verify the server dies with the app**

- Quit Osprey (tray → quit, or stop `pnpm tauri dev`).
- Run the `ps ... python` check again. Expected: the `mlx_server.py` process is gone (killed by the `RunEvent::Exit` hook). If it lingers, the kill hook needs fixing before this task is done.

- [ ] **Step 6: Verify a warm restart**

- Relaunch. Expected: NO onboarding window (model is cached); tray works immediately; first capture after ~a few seconds of `loading` succeeds.

- [ ] **Step 7: Final review commit (if any manual fixes were needed)**

If Steps 1-6 surfaced fixes, commit them with a descriptive message. Otherwise no commit.

---

## Known Limitations / Deferred to a follow-up

These are out of scope for the dev-MVP this plan delivers, but are real and should be tracked:

- **Release notarization is unproven (biggest risk).** This plan validates the app under `pnpm tauri dev` (no hardened runtime). For a *distributed, notarized* build, the venv's Python is downloaded by `uv` at runtime and is therefore unsigned and not notarized. macOS may quarantine/Gatekeeper-block executing it. The added entitlements (`disable-library-validation`, `allow-jit`, `allow-unsigned-executable-memory`) cover loading MLX's dylibs and Metal JIT, but **not** necessarily executing a quarantined interpreter from a downloaded app. A follow-up needs to either strip the quarantine xattr off the built venv (`xattr -dr com.apple.quarantine <venv>`) and/or ad-hoc sign it, then verify on a freshly-downloaded build. Decide this before any public distribution.
- **The release resource path is never exercised here.** `resolve_resource` uses `CARGO_MANIFEST_DIR/resources` in debug and `resource_dir()/resources` in release; Task 8 only runs the debug branch. A `pnpm tauri build` smoke test (launch the bundled `.app`, confirm it finds `uv`/`mlx_server.py`) should be added when moving toward release.
- **"Still loading" captures show a generic error.** If a capture fires before the model is `ready`, `/extract` returns 503 → `extract_from_image` returns an error string → the frontend shows its existing generic error animation, not a "model still loading, try again" message. Acceptable for MVP; a nicer message is a small follow-up (the 503 is already distinguishable from other failures by status code).
- **First run also downloads CPython 3.12 via `uv`** (tens of MB) in addition to the model and pip deps. Offline first-run fails cleanly (env build → `Failed` → onboarding error), but the onboarding copy frames this only as a model download.
- **No in-app retry on setup failure.** A failed setup surfaces the error UI; recovery is "restart Osprey," which re-runs the (resumable) setup. An in-app retry button + a `retry_setup` command is a deliberate follow-up, not MVP.

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Persistent MLX server (Python, Rust-supervised, warm) → Tasks 2, 4, 5. ✓
- Apple-Silicon-only, bundled `uv` + `mlx_server.py`, first-run venv build in app-data → Tasks 1, 4. ✓
- `mlx.rs` with `extract_from_image` matching the old contract, `health`, no `warm_model` → Task 3. ✓
- `/health` (downloading/loading/ready) + `/extract` → Task 2. ✓
- lib.rs setup: env build → spawn → readiness poll; commands swapped → Task 5. ✓
- Onboarding reworked for env+model progress → Task 6. ✓
- Removed: ollama.rs, OllamaChild, warm_model, pull_model/model_is_installed, ollama binaries, OLLAMA_MAX_LOADED_MODELS, KEEP_ALIVE, and the orphaned `tauri-plugin-shell` (Cargo dep + `init()` + `shell:default` capability + `plugins.shell` config + JS dep) → Tasks 5, 7. ✓
- Unchanged data flow / frontend contract (`capture_and_extract`, `useOsprey`) → Task 5 keeps the command name/signature shape; `useCaptures`/`useOsprey` untouched. ✓
- Open questions resolved: port = dynamic free port (Task 4); capture failure = server returns 503 → clean error string, no hang (Tasks 2, 3); respawn policy = none for MVP, kill-on-exit only, error surfaces via onboarding/error state (Tasks 5, 6). ✓
- First-launch detection uses a Rust-written `.setup-complete` marker (written after first `ready`), not HF-cache-dir existence, so an interrupted first download can't false-positively skip onboarding (Tasks 4, 5). Readiness poll never times out while the server is reachable and reporting progress; it fails only on sustained unreachability or a 60-min backstop (Task 5). ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases" left; every code step shows complete code. The Onboarding step 5 is an explicit no-op confirmation, not a placeholder.

**3. Type consistency:** `MlxServer { port, child, phase }`, `SetupPhase` (BuildingEnv/StartingServer/ServerUp/Failed), `ServerStatus` (Downloading/Loading/Ready/Error), `HealthStatus { status, progress }`, `mlx_status` string labels (preparing/starting/downloading/loading/ready/error) and the frontend `Phase`/`formatPhase` labels all line up across Tasks 3, 4, 5, 6. `api_url(port, path)`, `health(port)`, `extract_from_image(port, image_base64)` signatures consistent between definition (Task 3) and call sites (Tasks 4, 5). The `server.rs` helpers `env_is_ready`, `setup_is_complete`, `mark_setup_complete`, `setup_marker` (Task 4) are the only first-launch/readiness primitives referenced in Task 5 — the earlier `model_is_cached`/`model_cache_dir` helpers were removed and have no lingering call sites.
