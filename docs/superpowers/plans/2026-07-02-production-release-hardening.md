# Production Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Beaver recoverable, diagnosable, and updatable on strangers' Macs, then tag the first public release (v0.1.0).

**Architecture:** Four ship-blocker fixes (setup retry with failure detail, Screen Recording permission flow, file logging, orphan-server watchdog) plus an operability layer (passive update check, pinned Python deps, disk preflight, strict CSP) and launch collateral. All changes follow existing patterns: Tauri commands in `src-tauri/src/lib.rs`, pure helpers in per-domain Rust modules with unit tests, React components tested with vitest + testing-library using the hoisted `invokeMock` pattern.

**Tech Stack:** Tauri 2 (Rust), React 19 + TypeScript + Vite, tauri-plugin-log 2, fs4, reqwest, Python 3.12 (FastAPI/MLX), uv, vitest, cargo test.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-production-release-hardening-design.md`
- App version stays `0.1.0`; first public tag is `v0.1.0`.
- Disk preflight threshold: exactly 8 GB (`8 * 1024 * 1024 * 1024` bytes).
- Update check: at most once per 24h, only on popover open, disabled by `BEAVER_DISABLE_UPDATE_CHECK` (truthy per existing `is_truthy` semantics).
- Permission error sentinel string: `screen-permission-missing` (must match between Rust and TS).
- macOS-only app: shelling out to `/usr/bin/open` is acceptable; no new Tauri plugins besides `tauri-plugin-log`.
- Repo: `https://github.com/thomasindrias/beaver`. Update-check API URL: `https://api.github.com/repos/thomasindrias/beaver/releases/latest`.
- Run frontend tests with `pnpm test:run`, Rust tests with `cargo test` inside `src-tauri/`, Python tests with `uv run --no-project --with fastapi --with uvicorn --with pydantic --with tqdm python test_mlx_server.py` inside `src-tauri/resources/`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: File logging via tauri-plugin-log + Python server log redirect

**Files:**
- Modify: `src-tauri/Cargo.toml` (add deps)
- Modify: `src-tauri/src/lib.rs` (register plugin, replace `eprintln!`)
- Modify: `src-tauri/src/server.rs` (replace `eprintln!`, redirect child stdout/stderr)

**Interfaces:**
- Produces: `log::error!/warn!/info!` available everywhere in the Rust crate; MLX server output lands in `~/Library/Logs/se.djtl.beaver/mlx-server.log`; app log in `~/Library/Logs/se.djtl.beaver/beaver.log`.

- [ ] **Step 1: Add dependencies to `src-tauri/Cargo.toml`**

Append to `[dependencies]`:

```toml
tauri-plugin-log = "2"
log = "0.4"
```

- [ ] **Step 2: Register the plugin in `lib.rs`**

In `run()`, immediately after `tauri::Builder::default()`, add as the FIRST plugin:

```rust
.plugin(
    tauri_plugin_log::Builder::new()
        .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                file_name: Some("beaver".into()),
            }),
        ])
        .level(log::LevelFilter::Info)
        .max_file_size(5_000_000)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
        .build(),
)
```

In `.setup(|app| { ... })`, log startup context as the first statement:

```rust
log::info!(
    "Beaver v{} starting; logs in {:?}",
    app.package_info().version,
    app.path().app_log_dir().ok()
);
```

- [ ] **Step 3: Replace every `eprintln!` with a `log::` macro**

In `lib.rs` and `server.rs`, mechanically replace `eprintln!("Beaver: ...")` with `log::error!("...")` (drop the `Beaver: ` prefix — the log format already names the source). There are ~12 call sites (`apply_popover_vibrancy`, onboarding-window failure, env-build failure, spawn failure, unreachable/time-cap messages, popover hide/show/focus/reposition failures, capture-overlay failures, `mark_setup_complete`). The two "giving up"/time-cap messages and hide/show/reposition failures are `log::error!`; the vibrancy failure is `log::warn!`.

- [ ] **Step 4: Redirect the Python server's output to a log file**

In `server.rs`, replace `spawn_server` with:

```rust
/// Spawn the MLX server using the venv's Python, with HF_HOME pinned to the
/// app-data cache and stdout/stderr appended to mlx-server.log so first-run
/// failures are diagnosable in the field. Returns the child handle.
pub fn spawn_server(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let python = venv_python(app);
    let script = resolve_resource(app, "mlx_server.py");
    let mut cmd = Command::new(python);
    cmd.arg(script)
        .arg("--port")
        .arg(port.to_string())
        .env("HF_HOME", hf_home(app));

    // Best-effort log capture: a failure to open the log file must not block
    // the server itself.
    if let Ok(log_dir) = app.path().app_log_dir() {
        if std::fs::create_dir_all(&log_dir).is_ok() {
            if let Ok(file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_dir.join("mlx-server.log"))
            {
                if let Ok(err_file) = file.try_clone() {
                    cmd.stdout(std::process::Stdio::from(file))
                        .stderr(std::process::Stdio::from(err_file));
                }
            }
        }
    }

    cmd.spawn().map_err(|e| format!("failed to spawn MLX server: {e}"))
}
```

- [ ] **Step 5: Verify build and tests, confirm no `eprintln!` remains**

Run in `src-tauri/`: `cargo test`
Expected: all suites pass.
Run: `grep -rn "eprintln" src/` (inside `src-tauri/`)
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/server.rs
git commit -m "feat: add file logging and capture MLX server output"
```

---

### Task 2: Orphan-server watchdog (`--parent-pid`)

**Files:**
- Modify: `src-tauri/resources/mlx_server.py`
- Modify: `src-tauri/resources/test_mlx_server.py`
- Modify: `src-tauri/src/server.rs` (pass the flag; extract testable args builder)

**Interfaces:**
- Produces: `server::server_args(script: &Path, port: u16, parent_pid: u32) -> Vec<String>`; `mlx_server.py` accepts optional `--parent-pid <pid>` and self-terminates when reparented.

- [ ] **Step 1: Write failing Python tests**

Append to `test_mlx_server.py` (and add calls at the bottom `__main__` block):

```python
def test_parent_alive_true_for_current_ppid():
    import os
    assert m._parent_alive(os.getppid()) is True


def test_parent_alive_false_for_other_pid():
    assert m._parent_alive(1) is False
```

Add to the `__main__` block:

```python
    test_parent_alive_true_for_current_ppid()
    test_parent_alive_false_for_other_pid()
```

- [ ] **Step 2: Run tests to verify failure**

Run in `src-tauri/resources/`:
`uv run --no-project --with fastapi --with uvicorn --with pydantic --with tqdm python test_mlx_server.py`
Expected: `AttributeError: module 'mlx_server' has no attribute '_parent_alive'`

- [ ] **Step 3: Implement the watchdog in `mlx_server.py`**

Add `time` to the imports. Below `_resolve_model`, add:

```python
def _parent_alive(parent_pid: int) -> bool:
    """True while our parent is still the process that spawned us. When Beaver
    dies (crash, force-quit), macOS reparents us and getppid() changes."""
    return os.getppid() == parent_pid


def _watch_parent(parent_pid: int, poll_seconds: float = 2.0):
    while True:
        if not _parent_alive(parent_pid):
            os._exit(0)
        time.sleep(poll_seconds)
```

In `__main__`, add the argument and thread:

```python
    parser.add_argument("--parent-pid", type=int, default=None)
    args = parser.parse_args()

    if args.parent_pid is not None:
        threading.Thread(
            target=_watch_parent, args=(args.parent_pid,), daemon=True
        ).start()
    threading.Thread(target=_worker, daemon=True).start()
```

(The existing `args = parser.parse_args()` line moves after the new `add_argument`.)

- [ ] **Step 4: Run Python tests to verify pass**

Same command as Step 2. Expected: `OK`.

- [ ] **Step 5: Write failing Rust test for the args builder**

In `server.rs` tests module:

```rust
#[test]
fn server_args_include_port_and_parent_pid() {
    let args = server_args(std::path::Path::new("/x/mlx_server.py"), 11500, 4242);
    assert_eq!(
        args,
        vec![
            "/x/mlx_server.py".to_string(),
            "--port".to_string(),
            "11500".to_string(),
            "--parent-pid".to_string(),
            "4242".to_string(),
        ]
    );
}
```

Run in `src-tauri/`: `cargo test server_args`
Expected: FAIL — `server_args` not found.

- [ ] **Step 6: Implement `server_args` and use it in `spawn_server`**

In `server.rs`:

```rust
/// Argument vector for the MLX server process. Extracted for testability.
pub fn server_args(script: &std::path::Path, port: u16, parent_pid: u32) -> Vec<String> {
    vec![
        script.to_string_lossy().into_owned(),
        "--port".into(),
        port.to_string(),
        "--parent-pid".into(),
        parent_pid.to_string(),
    ]
}
```

In `spawn_server`, replace the `cmd.arg(script).arg("--port").arg(port.to_string())` chain with:

```rust
    cmd.args(server_args(&script, port, std::process::id()))
```

(`cmd` becomes `let mut cmd = Command::new(python); cmd.args(...) .env("HF_HOME", hf_home(app));`)

- [ ] **Step 7: Run Rust tests**

Run in `src-tauri/`: `cargo test`
Expected: PASS including `server_args_include_port_and_parent_pid`.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/resources/mlx_server.py src-tauri/resources/test_mlx_server.py src-tauri/src/server.rs
git commit -m "feat: MLX server exits when Beaver dies (parent-pid watchdog)"
```

---

### Task 3: Setup failure detail, retry command, and correct setup-marker semantics

**Files:**
- Modify: `src-tauri/src/server.rs` (MlxServer state + `fail` + constructor)
- Modify: `src-tauri/src/lib.rs` (extract `spawn_setup`, `retry_setup` command, `mlx_status` detail, fix `finish_onboarding`)

**Interfaces:**
- Consumes: `server::spawn_server`, `server::build_env`, `mlx::health` (existing).
- Produces: `MlxServer::new(port: u16)`, `MlxServer::fail(&self, msg: String)`, field `failure: Mutex<Option<String>>`, field `setup_running: AtomicBool`; Tauri command `retry_setup()`; `mlx_status` response gains `detail: string | null` (TS: `StatusReport.detail?: string | null`).

- [ ] **Step 1: Write failing Rust tests for the new state type**

In `server.rs` tests module:

```rust
#[test]
fn new_mlx_server_starts_in_building_env_with_no_failure() {
    let s = MlxServer::new(11500);
    assert_eq!(*s.phase.lock().unwrap(), SetupPhase::BuildingEnv);
    assert!(s.failure.lock().unwrap().is_none());
    assert!(!s.setup_running.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn fail_sets_phase_and_stores_reason() {
    let s = MlxServer::new(11500);
    s.fail("network burped".to_string());
    assert_eq!(*s.phase.lock().unwrap(), SetupPhase::Failed);
    assert_eq!(s.failure.lock().unwrap().as_deref(), Some("network burped"));
}
```

Run in `src-tauri/`: `cargo test mlx_server` — Expected: FAIL (no `new`, no `failure` field).

- [ ] **Step 2: Extend `MlxServer` in `server.rs`**

```rust
use std::sync::atomic::AtomicBool;

pub struct MlxServer {
    pub port: u16,
    pub child: Mutex<Option<Child>>,
    pub phase: Mutex<SetupPhase>,
    /// Short user-readable reason when phase == Failed.
    pub failure: Mutex<Option<String>>,
    /// Guards against stacked setup threads on rapid retries.
    pub setup_running: AtomicBool,
}

impl MlxServer {
    pub fn new(port: u16) -> Self {
        Self {
            port,
            child: Mutex::new(None),
            phase: Mutex::new(SetupPhase::BuildingEnv),
            failure: Mutex::new(None),
            setup_running: AtomicBool::new(false),
        }
    }

    /// Record a setup failure with a reason the UI can show.
    pub fn fail(&self, msg: String) {
        log::error!("setup failed: {msg}");
        *self.failure.lock().unwrap() = Some(msg);
        *self.phase.lock().unwrap() = SetupPhase::Failed;
    }
}
```

Run: `cargo test mlx_server` — Expected: PASS.

- [ ] **Step 3: Extract `spawn_setup` in `lib.rs` and wire retries**

Replace `app.manage(server::MlxServer { ... })` in `.setup` with `app.manage(server::MlxServer::new(port));`.

Move the onboarding-window creation OUT of the worker thread: in `.setup`, after `app.manage(...)`, compute `let first_launch = !server::setup_is_complete(app.handle()) || force_onboarding_enabled();` and if true, create the onboarding window right there (same builder code as today, minus `run_on_main_thread` — `.setup` already runs on the main thread). Then call `spawn_setup(app.handle().clone());`.

Add the function (the body is today's thread body, reshaped):

```rust
/// Build the env (first run), spawn the MLX server, and poll it to readiness —
/// all off the main thread. Re-runnable: `retry_setup` calls this again after a
/// failure. The `setup_running` flag makes concurrent calls a no-op.
fn spawn_setup(handle: tauri::AppHandle) {
    {
        let state = handle.state::<server::MlxServer>();
        if state
            .setup_running
            .swap(true, std::sync::atomic::Ordering::SeqCst)
        {
            return; // a setup pass is already in flight
        }
        *state.failure.lock().unwrap() = None;
        *state.phase.lock().unwrap() = server::SetupPhase::BuildingEnv;
        // A retry after a spawn-then-crash leaves a stale child; reap it.
        if let Ok(mut guard) = state.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }

    std::thread::spawn(move || {
        let state = handle.state::<server::MlxServer>();

        if !server::env_is_ready(&handle) {
            if let Err(msg) = server::preflight_disk(&handle) {
                state.fail(msg);
                state.setup_running.store(false, std::sync::atomic::Ordering::SeqCst);
                return;
            }
            if let Err(e) = server::build_env(&handle) {
                state.fail(format!(
                    "Couldn't prepare the on-device Python environment. Check your \
                     internet connection and try again. ({e})"
                ));
                state.setup_running.store(false, std::sync::atomic::Ordering::SeqCst);
                return;
            }
        }

        *state.phase.lock().unwrap() = server::SetupPhase::StartingServer;
        match server::spawn_server(&handle, state.port) {
            Ok(child) => {
                *state.child.lock().unwrap() = Some(child);
            }
            Err(e) => {
                state.fail(format!("Couldn't start the on-device model server. ({e})"));
                state.setup_running.store(false, std::sync::atomic::Ordering::SeqCst);
                return;
            }
        }

        // Poll to readiness (same policy as before: no wall-clock deadline while
        // reachable; fail on sustained unreachability, with an absolute cap).
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
                            state.fail(
                                "The on-device model failed to load. Try again — the \
                                 log file has details."
                                    .to_string(),
                            );
                            break;
                        }
                        _ => {} // downloading / loading — keep waiting
                    }
                }
                Err(_) => {
                    if last_reachable.elapsed() > unreachable_grace {
                        state.fail(
                            "Lost contact with the on-device model server. Check your \
                             internet connection and try again."
                                .to_string(),
                        );
                        break;
                    }
                }
            }
            if started.elapsed() > absolute_cap {
                state.fail("Setup took too long and was stopped. Try again.".to_string());
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        state.setup_running.store(false, std::sync::atomic::Ordering::SeqCst);
    });
}
```

Note: `server::preflight_disk` arrives in Task 4. For THIS task, insert a temporary always-Ok placeholder in `server.rs` so the crate compiles:

```rust
/// Placeholder until the disk preflight lands (next task).
pub fn preflight_disk(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}
```

- [ ] **Step 4: Add `retry_setup`, extend `mlx_status`, fix `finish_onboarding`**

```rust
#[tauri::command]
fn retry_setup(app: tauri::AppHandle) {
    spawn_setup(app);
}
```

Register it in `generate_handler![...]`.

`MlxStatus` gains a field:

```rust
#[derive(serde::Serialize)]
struct MlxStatus {
    phase: String,
    /// Download progress 0.0–1.0 during the downloading phase; `None` otherwise.
    progress: Option<f64>,
    /// User-readable failure reason when phase == "error"; `None` otherwise.
    detail: Option<String>,
}
```

In `mlx_status`, copy the failure out with the phase:

```rust
    let phase = *state.phase.lock().unwrap();
    let detail = state.failure.lock().unwrap().clone();
    let port = state.port;
```

and return `Ok(MlxStatus { phase: label, progress, detail: if label == "error" { detail } else { None } })` — note `label` is a `String`, compare with `label == "error"`.

In `finish_onboarding`, DELETE the `server::mark_setup_complete(&app);` line (the readiness poll is the only writer now). Update the function comment accordingly.

- [ ] **Step 5: Run the full Rust suite**

Run in `src-tauri/`: `cargo test`
Expected: PASS (including Task-1/2 tests).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/server.rs
git commit -m "feat: retryable setup with user-readable failure reasons"
```

---

### Task 4: Disk-space preflight

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `fs4`)
- Modify: `src-tauri/src/server.rs` (real `preflight_disk`, pure helpers + tests)

**Interfaces:**
- Consumes: `MlxServer::fail` (Task 3), called from `spawn_setup` (already wired in Task 3).
- Produces: `server::preflight_disk(app) -> Result<(), String>` (replaces placeholder), `server::disk_has_room(available: u64) -> bool`, `server::SETUP_DISK_NEEDED_BYTES: u64`, `server::insufficient_disk_message() -> String`.

- [ ] **Step 1: Write failing tests in `server.rs`**

```rust
#[test]
fn disk_has_room_boundary() {
    assert!(disk_has_room(SETUP_DISK_NEEDED_BYTES));
    assert!(!disk_has_room(SETUP_DISK_NEEDED_BYTES - 1));
}

#[test]
fn insufficient_disk_message_names_the_size() {
    assert!(insufficient_disk_message().contains("8 GB"));
}
```

Run in `src-tauri/`: `cargo test disk` — Expected: FAIL (symbols missing).

- [ ] **Step 2: Add `fs4 = "0.13"` to `[dependencies]` in `Cargo.toml`, implement helpers**

Replace the Task-3 placeholder in `server.rs`:

```rust
/// First-run setup needs venv (~2 GB) + model (~3 GB) + headroom.
pub const SETUP_DISK_NEEDED_BYTES: u64 = 8 * 1024 * 1024 * 1024;

pub fn disk_has_room(available: u64) -> bool {
    available >= SETUP_DISK_NEEDED_BYTES
}

pub fn insufficient_disk_message() -> String {
    "Beaver needs about 8 GB free to set up its on-device model. \
     Free up space and try again."
        .to_string()
}

/// Fail fast (with a clear reason) when the disk can't hold the first-run
/// setup, instead of dying mid-download. A failure to *measure* free space is
/// not fatal — setup proceeds and any real ENOSPC surfaces later.
pub fn preflight_disk(app: &tauri::AppHandle) -> Result<(), String> {
    let data = app_data(app);
    std::fs::create_dir_all(&data).map_err(|e| format!("create app data dir: {e}"))?;
    match fs4::available_space(&data) {
        Ok(avail) if !disk_has_room(avail) => Err(insufficient_disk_message()),
        _ => Ok(()),
    }
}
```

(If `fs4::available_space` doesn't exist at this path in the chosen version, the function lives at `fs4::available_space` in fs4 ≥0.8 — check `cargo doc`; the fallback crate with the identical free function is `fs2`.)

- [ ] **Step 3: Run tests**

Run in `src-tauri/`: `cargo test` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/server.rs
git commit -m "feat: fail setup early with a clear message when disk is short"
```

---

### Task 5: ModelDownload error UI — show reason, Try again

**Files:**
- Modify: `src/components/ModelDownload.tsx`
- Modify: `src/tests/ModelDownload.test.tsx`

**Interfaces:**
- Consumes: commands `mlx_status` (now returns `detail`), `retry_setup` (Task 3).
- Produces: error screen with a **Try again** button; no more "Continue anyway".

- [ ] **Step 1: Write failing tests**

Append to `src/tests/ModelDownload.test.tsx`:

```tsx
describe("ModelDownload failure", () => {
  beforeEach(() => invokeMock.mockReset());

  it("shows the failure detail from the backend", async () => {
    invokeMock.mockResolvedValue({
      phase: "error",
      progress: null,
      detail: "Beaver needs about 8 GB free to set up its on-device model. Free up space and try again.",
    });
    render(<ModelDownload onComplete={() => {}} />);

    expect(await screen.findByText(/8 GB free/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue anyway/i })).not.toBeInTheDocument();
  });

  it("falls back to generic copy when there is no detail", async () => {
    invokeMock.mockResolvedValue({ phase: "error", progress: null, detail: null });
    render(<ModelDownload onComplete={() => {}} />);

    expect(await screen.findByText(/couldn't finish setting up/i)).toBeInTheDocument();
  });

  it("Try again invokes retry_setup and resumes polling", async () => {
    invokeMock.mockResolvedValue({ phase: "error", progress: null, detail: null });
    render(<ModelDownload onComplete={() => {}} />);

    const btn = await screen.findByRole("button", { name: /try again/i });
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "mlx_status" ? { phase: "preparing", progress: null, detail: null } : undefined
    );
    fireEvent.click(btn);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("retry_setup"));
    expect(await screen.findByText(/preparing environment/i)).toBeInTheDocument();
  });
});
```

Add `fireEvent` to the testing-library import at the top of the file.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test:run src/tests/ModelDownload.test.tsx`
Expected: the three new tests FAIL (no detail rendering, "Continue anyway" still present, no Try again button).

- [ ] **Step 3: Implement in `ModelDownload.tsx`**

Extend the report shape and state:

```tsx
interface StatusReport {
  phase: Phase;
  progress: number | null;
  detail?: string | null;
}
```

Inside the component:

```tsx
  const [phase, setPhase] = useState<Phase>("preparing");
  const [progress, setProgress] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
```

In the poll handler, after `setProgress(status.progress);` add `setDetail(status.detail ?? null);`. Change the effect dependency array to `[onComplete, attempt]`.

Add the retry callback (import `useCallback`):

```tsx
  const retry = useCallback(async () => {
    await invoke("retry_setup").catch(console.error);
    setPhase("preparing");
    setProgress(null);
    setDetail(null);
    setAttempt((a) => a + 1); // re-arms the polling effect
  }, []);
```

Replace the error view's copy + button:

```tsx
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {detail ??
            "Beaver couldn't finish setting up its local AI. Check your internet connection and try again."}
        </p>
        <Button className="mt-6 w-full" onClick={retry}>
          Try again
        </Button>
```

- [ ] **Step 4: Run the frontend suite**

Run: `pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ModelDownload.tsx src/tests/ModelDownload.test.tsx
git commit -m "feat: setup error screen shows the reason and offers retry"
```

---

### Task 6: Screen Recording permission — Rust side

**Files:**
- Create: `src-tauri/src/permission.rs`
- Modify: `src-tauri/src/lib.rs` (module, 4 commands, capture guard, relaunch marker check)
- Modify: `src-tauri/src/server.rs` (relaunch marker helpers)

**Interfaces:**
- Produces: commands `screen_permission_granted() -> bool`, `request_screen_permission() -> bool`, `open_screen_recording_settings()`, `relaunch_app()`; `capture_and_extract` errors with the exact string `screen-permission-missing` when access is absent; `server::mark_permission_relaunch(app)` / `server::take_permission_relaunch(app) -> bool`; `permission::PERMISSION_ERROR: &str`.

- [ ] **Step 1: Write failing tests**

New file `src-tauri/src/permission.rs` — start with tests only won't compile; instead add the module with tests in one go (next step) but write the test list first in `server.rs` for the marker helpers... The marker helpers need an `AppHandle`, which unit tests can't build — they stay covered by the manual matrix (Task 14). Add this pure test to `permission.rs` (created next step):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_error_is_the_shared_sentinel() {
        assert_eq!(PERMISSION_ERROR, "screen-permission-missing");
    }

    #[test]
    fn settings_url_targets_screen_capture_pane() {
        assert!(SETTINGS_URL.contains("Privacy_ScreenCapture"));
    }
}
```

- [ ] **Step 2: Create `src-tauri/src/permission.rs`**

```rust
//! Screen Recording (TCC) permission checks via CoreGraphics.
//!
//! `CGPreflightScreenCaptureAccess` reads the current grant without prompting;
//! `CGRequestScreenCaptureAccess` shows the system prompt at most once per
//! install — afterwards macOS only listens in System Settings, hence the
//! deep-link. Capture APIs honor a new grant only after the app relaunches.

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Error sentinel returned by capture commands when access is missing.
/// Must match the string the frontend checks for (useBeaver.ts).
pub const PERMISSION_ERROR: &str = "screen-permission-missing";

pub const SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

pub fn screen_capture_granted() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        CGPreflightScreenCaptureAccess()
    }
    #[cfg(not(target_os = "macos"))]
    true
}

pub fn request_screen_capture() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        CGRequestScreenCaptureAccess()
    }
    #[cfg(not(target_os = "macos"))]
    true
}
```

(Then append the tests block from Step 1.)

- [ ] **Step 3: Marker helpers in `server.rs`**

```rust
/// Marker asking the next launch to open the popover once — written just
/// before the post-permission relaunch so the user isn't dropped into a
/// silent menu-bar app.
fn permission_relaunch_marker(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(".post-permission-relaunch")
}

pub fn mark_permission_relaunch(app: &tauri::AppHandle) {
    if let Err(e) = std::fs::write(permission_relaunch_marker(app), b"1") {
        log::error!("failed to write relaunch marker: {e}");
    }
}

/// Consume the marker: true exactly once after a permission relaunch.
pub fn take_permission_relaunch(app: &tauri::AppHandle) -> bool {
    let p = permission_relaunch_marker(app);
    if p.exists() {
        let _ = std::fs::remove_file(&p);
        true
    } else {
        false
    }
}
```

- [ ] **Step 4: Commands + guard + marker consumption in `lib.rs`**

Add `mod permission;` to the module list. Add commands:

```rust
#[tauri::command]
fn screen_permission_granted() -> bool {
    permission::screen_capture_granted()
}

#[tauri::command]
fn request_screen_permission() -> bool {
    permission::request_screen_capture()
}

#[tauri::command]
fn open_screen_recording_settings() {
    if let Err(e) = std::process::Command::new("open")
        .arg(permission::SETTINGS_URL)
        .spawn()
    {
        log::error!("failed to open System Settings: {e}");
    }
}

#[tauri::command]
fn relaunch_app(app: tauri::AppHandle) {
    server::mark_permission_relaunch(&app);
    app.restart();
}
```

Register all four in `generate_handler![...]`.

Guard at the top of `capture_and_extract` (before the capture call):

```rust
    if !permission::screen_capture_granted() {
        return Err(permission::PERMISSION_ERROR.to_string());
    }
```

In `.setup`, after `spawn_setup(...)`:

```rust
            // After the permission relaunch, surface the popover once so the
            // user lands somewhere instead of a silent menu-bar app.
            if server::take_permission_relaunch(app.handle()) {
                open_popover_at_menubar(app.handle());
            }
```

- [ ] **Step 5: Run the Rust suite**

Run in `src-tauri/`: `cargo test`
Expected: PASS, including the two new permission tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/permission.rs src-tauri/src/lib.rs src-tauri/src/server.rs
git commit -m "feat: screen-recording permission preflight, guard, and relaunch"
```

---

### Task 7: Onboarding permission step

**Files:**
- Create: `src/components/PermissionStep.tsx`
- Create: `src/tests/PermissionStep.test.tsx`
- Modify: `src/components/Onboarding.tsx`
- Modify: `src/tests/Onboarding.test.tsx`

**Interfaces:**
- Consumes: commands `screen_permission_granted`, `request_screen_permission`, `open_screen_recording_settings`, `relaunch_app` (Task 6).
- Produces: `<PermissionStep />` (no props); Onboarding `Step` union gains `"permission"`.

- [ ] **Step 1: Write failing tests — `src/tests/PermissionStep.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { PermissionStep } from "../components/PermissionStep";

describe("PermissionStep", () => {
  beforeEach(() => invokeMock.mockReset());

  it("asks for access while the permission is missing", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "screen_permission_granted" ? false : undefined
    );
    render(<PermissionStep />);

    const grant = await screen.findByRole("button", { name: /grant access/i });
    fireEvent.click(grant);
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("request_screen_permission")
    );
  });

  it("offers the System Settings deep link", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "screen_permission_granted" ? false : undefined
    );
    render(<PermissionStep />);

    fireEvent.click(await screen.findByRole("button", { name: /open system settings/i }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_screen_recording_settings")
    );
  });

  it("switches to relaunch once access is granted", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "screen_permission_granted" ? true : undefined
    );
    render(<PermissionStep />);

    const relaunch = await screen.findByRole("button", { name: /relaunch beaver/i });
    fireEvent.click(relaunch);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("relaunch_app"));
  });
});
```

Run: `pnpm test:run src/tests/PermissionStep.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 2: Create `src/components/PermissionStep.tsx`**

```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MonitorCheck, MonitorUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// Onboarding step shown when Screen Recording access is missing. Polls the
// grant every second (System Settings toggles don't push events) and flips to
// a relaunch prompt once granted — macOS applies the TCC grant to capture
// APIs only after the app restarts.
export function PermissionStep() {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const ok = await invoke<boolean>("screen_permission_granted");
        if (active) setGranted(ok);
      } catch {
        // backend not ready — keep polling
      }
      if (active) timer = setTimeout(poll, 1000);
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  if (granted) {
    return (
      <div className="flex w-full max-w-[340px] flex-col items-center text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <MonitorCheck className="size-7" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Access granted</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          One last thing — macOS applies the permission after a quick relaunch.
        </p>
        <Button
          className="mt-6 w-full"
          onClick={() => invoke("relaunch_app").catch(console.error)}
        >
          Relaunch Beaver
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[340px] flex-col items-center text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <MonitorUp className="size-7" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">Allow screen access</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Beaver reads only the region you draw a box around, and never sends it
        anywhere — extraction runs entirely on this Mac.
      </p>
      <Button
        className="mt-6 w-full"
        onClick={() => invoke("request_screen_permission").catch(console.error)}
      >
        Grant access
      </Button>
      <Button
        variant="ghost"
        className="mt-2 w-full text-muted-foreground"
        onClick={() => invoke("open_screen_recording_settings").catch(console.error)}
      >
        Open System Settings
      </Button>
    </div>
  );
}
```

Run: `pnpm test:run src/tests/PermissionStep.test.tsx` — Expected: PASS.

- [ ] **Step 3: Wire the step into `Onboarding.tsx` (failing test first)**

In `src/tests/Onboarding.test.tsx`, change the default mock so the permission command resolves granted (keeps existing tests green):

```tsx
    invokeMock.mockReset().mockImplementation(async (cmd: string) =>
      cmd === "screen_permission_granted" ? true : undefined
    );
```

`reachReadyStep` becomes async (the permission check is awaited):

```tsx
async function reachReadyStep() {
  fireEvent.click(screen.getByRole("button", { name: /get started/i }));
  fireEvent.click(screen.getByRole("button", { name: /finish-download/i }));
  await act(async () => {}); // flush the permission check promise
}
```

Update its call sites to `await reachReadyStep();` (make those tests `async`). Add:

```tsx
  it("detours to the permission step when access is missing", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "screen_permission_granted" ? false : undefined
    );
    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish-download/i }));
    await act(async () => {});

    expect(screen.getByText(/allow screen access/i)).toBeInTheDocument();
  });
```

Also stub PermissionStep next to the ModelDownload stub so the poll loop stays out of Onboarding's tests:

```tsx
vi.mock("../components/PermissionStep", () => ({
  PermissionStep: () => <div>allow screen access</div>,
}));
```

Run: `pnpm test:run src/tests/Onboarding.test.tsx` — Expected: new test FAILS.

- [ ] **Step 4: Implement in `Onboarding.tsx`**

```tsx
type Step = "welcome" | "download" | "permission" | "ready";
```

Import `PermissionStep`. Replace `handleDownloadComplete`:

```tsx
  const handleDownloadComplete = useCallback(async () => {
    // If Screen Recording is already granted (or the check fails), skip the
    // permission detour — the guard at capture time is the safety net.
    const granted = await invoke<boolean>("screen_permission_granted").catch(() => true);
    setStep(granted ? "ready" : "permission");
  }, []);
```

Add the step's render branch after the download branch:

```tsx
      {step === "permission" && (
        <div key="permission" className="animate-rise flex flex-1 flex-col items-center justify-center text-center">
          <PermissionStep />
        </div>
      )}
```

- [ ] **Step 5: Run the frontend suite**

Run: `pnpm test:run` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/PermissionStep.tsx src/components/Onboarding.tsx src/tests/PermissionStep.test.tsx src/tests/Onboarding.test.tsx
git commit -m "feat: onboarding asks for screen access and relaunches to apply it"
```

---

### Task 8: Permission-aware capture toast

**Files:**
- Modify: `src/hooks/useBeaver.ts`
- Modify: `src/components/CursorToast.tsx`
- Modify: `src/App.tsx`
- Modify: `src/tests/useBeaver.test.ts`, `src/tests/CursorToast.test.tsx`

**Interfaces:**
- Consumes: the `screen-permission-missing` error string from `capture_and_extract` (Task 6).
- Produces: `useBeaver` returns `{ state, errorKind, runCapture }` with `errorKind: "generic" | "permission"`; `CursorToast` accepts optional `errorKind` prop; export `PERMISSION_ERROR_DWELL_MS = 4000` from `useBeaver.ts`.

- [ ] **Step 1: Write failing tests**

In `src/tests/useBeaver.test.ts` add (follow the file's existing mock pattern for `invoke` — same hoisted `invokeMock`):

```ts
it("flags a permission error so the toast can explain it", async () => {
  invokeMock.mockRejectedValue("screen-permission-missing");
  const { result } = renderHook(() => useBeaver());
  await act(async () => {
    await result.current.runCapture({ x: 0, y: 0, width: 10, height: 10 });
  });
  expect(result.current.state).toBe("error");
  expect(result.current.errorKind).toBe("permission");
});

it("keeps generic errors generic", async () => {
  invokeMock.mockRejectedValue("MLX request failed: boom");
  const { result } = renderHook(() => useBeaver());
  await act(async () => {
    await result.current.runCapture({ x: 0, y: 0, width: 10, height: 10 });
  });
  expect(result.current.errorKind).toBe("generic");
});
```

In `src/tests/CursorToast.test.tsx` add:

```tsx
it("explains the fix when the error is a missing permission", () => {
  render(<CursorToast state="error" errorKind="permission" origin={{ x: 0, y: 0 }} />);
  expect(screen.getByText(/screen recording access/i)).toBeInTheDocument();
});
```

Run: `pnpm test:run src/tests/useBeaver.test.ts src/tests/CursorToast.test.tsx`
Expected: new tests FAIL.

- [ ] **Step 2: Implement `useBeaver.ts`**

```ts
export const PERMISSION_ERROR_DWELL_MS = 4000;
export type CaptureErrorKind = "generic" | "permission";
```

In the hook add `const [errorKind, setErrorKind] = useState<CaptureErrorKind>("generic");`. Replace the catch block:

```ts
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
```

Return `{ state, errorKind, runCapture }`.

- [ ] **Step 3: Implement `CursorToast.tsx` + `App.tsx`**

`CursorToast` props gain `errorKind?: "generic" | "permission"` (default `"generic"`); thread it into `render(state, msgIndex, errorKind)` and in the error branch:

```tsx
  if (state === "error") {
    return {
      icon: <TriangleAlert className="size-4 text-amber-400" />,
      message:
        errorKind === "permission"
          ? "Beaver needs Screen Recording access — check System Settings."
          : "Dam — couldn't read that. Try again.",
    };
  }
```

In `App.tsx`: `const { state, errorKind, runCapture } = useBeaver(saveCapture, closeWindow);` and `<CursorToast state={state} errorKind={errorKind} origin={origin} />`.

- [ ] **Step 4: Run the frontend suite**

Run: `pnpm test:run` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBeaver.ts src/components/CursorToast.tsx src/App.tsx src/tests/useBeaver.test.ts src/tests/CursorToast.test.tsx
git commit -m "feat: capture toast explains missing screen-recording permission"
```

---

### Task 9: Passive update check — Rust side

**Files:**
- Create: `src-tauri/src/update.rs`
- Modify: `src-tauri/src/lib.rs` (module + `check_for_update` + `open_external` commands)
- Modify: `src-tauri/src/server.rs` (cache path helper)

**Interfaces:**
- Produces: command `check_for_update() -> Option<UpdateInfo>` where `UpdateInfo { version: String, url: String }` (TS: `{ version: string; url: string } | null`); command `open_external(url: String)` restricted to `https://github.com/thomasindrias/beaver` prefixes; pure fns `update::parse_tag`, `update::is_newer`, `update::cache_is_fresh`, `update::allowed_external_url`.

- [ ] **Step 1: Create `src-tauri/src/update.rs` with failing-first tests**

Write the tests module first, run `cargo test update` to see them fail to compile, then fill in the implementation:

```rust
//! Passive update visibility: compare the running version against the latest
//! GitHub release tag. No downloads, no background timers — callers decide
//! when to check (the popover, at most once per 24h via the cache file).

use std::time::Duration;

pub const RELEASES_API: &str =
    "https://api.github.com/repos/thomasindrias/beaver/releases/latest";
pub const CHECK_INTERVAL_SECS: u64 = 24 * 60 * 60;
pub const ALLOWED_URL_PREFIX: &str = "https://github.com/thomasindrias/beaver";

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct UpdateInfo {
    pub version: String,
    pub url: String,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
pub struct CheckCache {
    pub checked_at: u64,
    pub latest_tag: String,
    pub url: String,
}

/// Parse "v1.2.3" / "1.2.3" / "1.2" into a comparable triple. Pre-release
/// suffixes ("1.2.3-beta") count as the base version.
pub fn parse_tag(tag: &str) -> Option<(u64, u64, u64)> {
    let t = tag.trim().trim_start_matches('v');
    let mut parts = t.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts
        .next()
        .unwrap_or("0")
        .split('-')
        .next()?
        .parse()
        .ok()?;
    Some((major, minor, patch))
}

pub fn is_newer(current: &str, latest: &str) -> bool {
    match (parse_tag(current), parse_tag(latest)) {
        (Some(c), Some(l)) => l > c,
        _ => false,
    }
}

pub fn cache_is_fresh(checked_at: u64, now: u64) -> bool {
    now.saturating_sub(checked_at) < CHECK_INTERVAL_SECS
}

/// Only ever open our own GitHub pages from the update pill.
pub fn allowed_external_url(url: &str) -> bool {
    url.starts_with(ALLOWED_URL_PREFIX)
}

#[derive(serde::Deserialize)]
struct LatestRelease {
    tag_name: String,
    html_url: String,
}

/// GET the latest release. `None` on any failure — an update check must never
/// surface an error to the user.
pub async fn fetch_latest() -> Option<(String, String)> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;
    let resp = client
        .get(RELEASES_API)
        .header("User-Agent", "beaver-update-check")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let r: LatestRelease = resp.json().await.ok()?;
    Some((r.tag_name, r.html_url))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_v_prefixed_and_bare_tags() {
        assert_eq!(parse_tag("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_tag("0.1.0"), Some((0, 1, 0)));
        assert_eq!(parse_tag("v1.2"), Some((1, 2, 0)));
        assert_eq!(parse_tag("v1.2.3-beta"), Some((1, 2, 3)));
        assert_eq!(parse_tag("not-a-version"), None);
    }

    #[test]
    fn newer_only_when_strictly_greater() {
        assert!(is_newer("0.1.0", "v0.1.1"));
        assert!(is_newer("0.1.0", "v1.0.0"));
        assert!(!is_newer("0.1.0", "v0.1.0"));
        assert!(!is_newer("0.2.0", "v0.1.9"));
        assert!(!is_newer("0.1.0", "garbage"));
    }

    #[test]
    fn cache_freshness_boundary() {
        assert!(cache_is_fresh(1000, 1000 + CHECK_INTERVAL_SECS - 1));
        assert!(!cache_is_fresh(1000, 1000 + CHECK_INTERVAL_SECS));
    }

    #[test]
    fn external_urls_restricted_to_our_repo() {
        assert!(allowed_external_url(
            "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0"
        ));
        assert!(!allowed_external_url("https://evil.example.com/"));
        assert!(!allowed_external_url("file:///etc/passwd"));
    }
}
```

- [ ] **Step 2: Cache path helper in `server.rs`**

```rust
pub fn update_cache_path(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join("update-check.json")
}
```

- [ ] **Step 3: Commands in `lib.rs`**

Add `mod update;` and:

```rust
#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> Option<update::UpdateInfo> {
    if is_truthy(std::env::var("BEAVER_DISABLE_UPDATE_CHECK").ok()) {
        return None;
    }
    let current = app.package_info().version.to_string();
    let cache_path = server::update_cache_path(&app);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs();

    let cached: Option<update::CheckCache> = std::fs::read_to_string(&cache_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());

    let cache = match cached {
        Some(c) if update::cache_is_fresh(c.checked_at, now) => c,
        _ => {
            let (latest_tag, url) = update::fetch_latest().await?;
            let c = update::CheckCache { checked_at: now, latest_tag, url };
            if let Ok(json) = serde_json::to_string(&c) {
                let _ = std::fs::write(&cache_path, json);
            }
            c
        }
    };

    if update::is_newer(&current, &cache.latest_tag) {
        Some(update::UpdateInfo {
            version: cache.latest_tag.trim_start_matches('v').to_string(),
            url: cache.url,
        })
    } else {
        None
    }
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !update::allowed_external_url(&url) {
        return Err("blocked url".to_string());
    }
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

Register both in `generate_handler![...]`.

- [ ] **Step 4: Run the Rust suite**

Run in `src-tauri/`: `cargo test` — Expected: PASS including the four update tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/update.rs src-tauri/src/lib.rs src-tauri/src/server.rs
git commit -m "feat: passive daily update check against GitHub releases"
```

---

### Task 10: Popover status banner + update pill

**Files:**
- Create: `src/components/StatusBanner.tsx`
- Create: `src/components/UpdatePill.tsx`
- Create: `src/tests/StatusBanner.test.tsx`
- Create: `src/tests/UpdatePill.test.tsx`
- Modify: `src/components/TrayPopover.tsx`

**Interfaces:**
- Consumes: commands `mlx_status` (with `detail`), `screen_permission_granted`, `retry_setup`, `open_screen_recording_settings`, `check_for_update`, `open_external`.
- Produces: `<StatusBanner />`, `<UpdatePill />` (both no-prop, self-fetching).

- [ ] **Step 1: Write failing tests**

`src/tests/StatusBanner.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { StatusBanner } from "../components/StatusBanner";

function mockBackend(opts: { granted: boolean; phase: string; detail?: string | null }) {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "screen_permission_granted") return opts.granted;
    if (cmd === "mlx_status")
      return { phase: opts.phase, progress: null, detail: opts.detail ?? null };
    return undefined;
  });
}

describe("StatusBanner", () => {
  beforeEach(() => invokeMock.mockReset());

  it("renders nothing when ready and permitted", async () => {
    mockBackend({ granted: true, phase: "ready" });
    const { container } = render(<StatusBanner />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("mlx_status"));
    expect(container).toBeEmptyDOMElement();
  });

  it("warns when screen permission is missing and opens settings", async () => {
    mockBackend({ granted: false, phase: "ready" });
    render(<StatusBanner />);
    expect(await screen.findByText(/screen recording is off/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open settings/i }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_screen_recording_settings")
    );
  });

  it("shows the failure reason with a retry action", async () => {
    mockBackend({ granted: true, phase: "error", detail: "Lost contact with the on-device model server." });
    render(<StatusBanner />);
    expect(await screen.findByText(/lost contact/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("retry_setup"));
  });
});
```

`src/tests/UpdatePill.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { UpdatePill } from "../components/UpdatePill";

describe("UpdatePill", () => {
  beforeEach(() => invokeMock.mockReset());

  it("renders nothing when up to date", async () => {
    invokeMock.mockResolvedValue(null);
    const { container } = render(<UpdatePill />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("check_for_update"));
    expect(container).toBeEmptyDOMElement();
  });

  it("links to the release when an update exists", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "check_for_update"
        ? { version: "0.2.0", url: "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0" }
        : undefined
    );
    render(<UpdatePill />);

    const pill = await screen.findByRole("button", { name: /v0\.2\.0 available/i });
    fireEvent.click(pill);
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_external", {
        url: "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0",
      })
    );
  });
});
```

Run: `pnpm test:run src/tests/StatusBanner.test.tsx src/tests/UpdatePill.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 2: Create `src/components/StatusBanner.tsx`**

```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, MonitorUp } from "lucide-react";

interface StatusReport {
  phase: string;
  progress: number | null;
  detail?: string | null;
}

// Thin banner under the popover header for the two states a user must act on:
// missing Screen Recording permission and a failed model setup. Polls while
// visible; disappears once everything is healthy.
export function StatusBanner() {
  const [granted, setGranted] = useState(true);
  const [status, setStatus] = useState<StatusReport | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [ok, s] = await Promise.all([
          invoke<boolean>("screen_permission_granted"),
          invoke<StatusReport>("mlx_status"),
        ]);
        if (!active) return;
        setGranted(ok);
        setStatus(s);
        if (ok && s.phase === "ready") return; // healthy — stop polling
      } catch {
        // backend hiccup — keep polling
      }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const retry = () => {
    invoke("retry_setup").catch(console.error);
  };

  if (!granted) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
        <MonitorUp className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">Screen Recording is off — captures won't work.</span>
        <button
          onClick={() => invoke("open_screen_recording_settings").catch(console.error)}
          className="shrink-0 rounded-md bg-amber-500/20 px-2 py-1 font-medium hover:bg-amber-500/30"
        >
          Open Settings
        </button>
      </div>
    );
  }

  if (status?.phase === "error") {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
        <AlertCircle className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          {status.detail ?? "Beaver's on-device model isn't running."}
        </span>
        <button
          onClick={retry}
          className="shrink-0 rounded-md bg-destructive/20 px-2 py-1 font-medium hover:bg-destructive/30"
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 3: Create `src/components/UpdatePill.tsx`**

```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UpdateInfo {
  version: string;
  url: string;
}

// Small header pill when a newer release exists. The backend rate-limits the
// underlying network call to once a day; rendering this is otherwise free.
export function UpdatePill() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    invoke<UpdateInfo | null>("check_for_update")
      .then(setUpdate)
      .catch(() => {});
  }, []);

  if (!update) return null;

  return (
    <button
      onClick={() => invoke("open_external", { url: update.url }).catch(console.error)}
      className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/25"
    >
      v{update.version} available
    </button>
  );
}
```

Run: `pnpm test:run src/tests/StatusBanner.test.tsx src/tests/UpdatePill.test.tsx`
Expected: PASS.

- [ ] **Step 4: Compose into `TrayPopover.tsx`**

Import both. In the header, insert the pill before the captures badge:

```tsx
        <span className="text-[15px] font-semibold tracking-tight">Beaver</span>
        <div className="ml-auto flex items-center gap-2">
          <UpdatePill />
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {captures.length} {captures.length === 1 ? "capture" : "captures"}
          </span>
        </div>
```

(The badge's `ml-auto` moves to the wrapping div.) After the `<div className="h-px bg-border" />` divider, add `<StatusBanner />`.

- [ ] **Step 5: Run the full frontend suite**

Run: `pnpm test:run` — Expected: PASS (App.test.tsx renders TrayPopover; if its invoke mock now needs `check_for_update`/`mlx_status`/`screen_permission_granted` handled, extend that mock to return `null` / `{ phase: "ready", progress: null, detail: null }` / `true` respectively).

- [ ] **Step 6: Commit**

```bash
git add src/components/StatusBanner.tsx src/components/UpdatePill.tsx src/components/TrayPopover.tsx src/tests/StatusBanner.test.tsx src/tests/UpdatePill.test.tsx src/tests/App.test.tsx
git commit -m "feat: popover surfaces setup failures, permission state, and updates"
```

---

### Task 11: Pin Python dependencies with a lockfile

**Files:**
- Create: `src-tauri/resources/requirements.lock` (generated)
- Modify: `src-tauri/src/server.rs` (`build_env` installs the lock)
- Modify: `src-tauri/tauri.conf.json` (bundle the lock)
- Modify: `.github/workflows/ci.yml` (lock resolution check)
- Modify: `src/tests/tauri-config.test.ts` (assert lock is bundled)

**Interfaces:**
- Produces: fully pinned `requirements.lock` bundled as a resource; `build_env` no longer reads `requirements.txt` at runtime.

- [ ] **Step 1: Write the failing config test**

In `src/tests/tauri-config.test.ts`, add (matching the file's existing import style for the config JSON):

```ts
it("bundles the pinned Python lockfile", () => {
  expect(config.bundle.resources).toContain("resources/requirements.lock");
});
```

Run: `pnpm test:run src/tests/tauri-config.test.ts` — Expected: FAIL.

- [ ] **Step 2: Generate the lock**

```bash
cd src-tauri/resources
uv pip compile requirements.txt -o requirements.lock --python-version 3.12
```

Inspect: `requirements.lock` must contain `mlx-vlm==0.5.0` plus pinned transitives (fastapi, uvicorn, huggingface-hub, …). Sanity-check that `fastapi`, `uvicorn`, `pydantic`, and `tqdm` all appear — they are what `mlx_server.py` imports. If any is missing from the resolution, add it to `requirements.txt` explicitly and re-compile.

- [ ] **Step 3: Bundle + install from the lock**

`tauri.conf.json` → `bundle.resources` becomes:

```json
    "resources": [
      "resources/uv",
      "resources/mlx_server.py",
      "resources/requirements.lock"
    ]
```

(`requirements.txt` no longer ships; it stays in the repo as the compile source.)

In `server.rs` `build_env`, change `let req = resolve_resource(app, "requirements.txt");` to `let req = resolve_resource(app, "requirements.lock");`.

- [ ] **Step 4: CI lock-resolution check**

In `.github/workflows/ci.yml`, after the "Run MLX server unit tests" step:

```yaml
      - name: Check Python lockfile resolves
        working-directory: src-tauri/resources
        run: |
          uv venv /tmp/beaver-lock-check --python 3.12
          uv pip install --python /tmp/beaver-lock-check/bin/python --dry-run -r requirements.lock
```

- [ ] **Step 5: Verify**

Run: `pnpm test:run src/tests/tauri-config.test.ts` — Expected: PASS.
Run the Step-4 commands locally — Expected: dry-run resolution succeeds.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/resources/requirements.lock src-tauri/src/server.rs src-tauri/tauri.conf.json .github/workflows/ci.yml src/tests/tauri-config.test.ts
git commit -m "feat: pin the full Python dependency tree with a lockfile"
```

---

### Task 12: Strict CSP

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src/tests/tauri-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("sets a strict CSP", () => {
  const csp = config.app.security.csp;
  expect(csp).toBeTruthy();
  expect(csp).toContain("default-src 'self'");
});
```

Run: `pnpm test:run src/tests/tauri-config.test.ts` — Expected: FAIL (csp is null).

- [ ] **Step 2: Set the policy**

In `tauri.conf.json`:

```json
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src ipc: http://ipc.localhost"
    }
```

- [ ] **Step 3: Verify tests + smoke-test the app**

Run: `pnpm test:run` — Expected: PASS.
Run: `pnpm tauri dev` and click through: onboarding renders (`BEAVER_FORCE_ONBOARDING=1 pnpm tauri dev`), popover opens with vibrancy + animations, capture overlay draws, a capture round-trips. Watch the webview console for CSP violation reports; if the WebP animations or shadcn styles are blocked, extend only the specific directive (e.g. add `media-src 'self'`), never `unsafe-eval`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src/tests/tauri-config.test.ts
git commit -m "feat: enforce a strict content-security-policy"
```

---

### Task 13: Launch collateral — changelog, templates, docs

**Files:**
- Create: `CHANGELOG.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/PULL_REQUEST_TEMPLATE.md`
- Modify: `README.md`, `SECURITY.md`, `CONTRIBUTING.md`

- [ ] **Step 1: `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to Beaver are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-07-XX

First public release.

- Menu-bar capture: `Cmd+Shift+D`, drag a region, get clean Markdown on the clipboard.
- Fully on-device vision (Qwen2.5-VL-3B via MLX); captures never leave the Mac.
- Capture history in the menu-bar popover (local SQLite).
- Guided onboarding: model download with progress, Screen Recording permission flow, setup retry with clear failure reasons.
- Passive update notice in the popover (checks GitHub Releases at most daily; disable with `BEAVER_DISABLE_UPDATE_CHECK=1`).
- Diagnosable failures: app and model-server logs in `~/Library/Logs/se.djtl.beaver/`.

[0.1.0]: https://github.com/thomasindrias/beaver/releases/tag/v0.1.0
```

(Fill the date at release time.)

- [ ] **Step 2: Issue/PR templates**

`.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: true
```

`.github/ISSUE_TEMPLATE/bug_report.yml`:

```yaml
name: Bug report
description: Something broke or behaved unexpectedly
labels: [bug]
body:
  - type: input
    id: version
    attributes:
      label: Beaver version
      placeholder: "0.1.0 (menu-bar popover header, or the DMG filename)"
    validations:
      required: true
  - type: input
    id: macos
    attributes:
      label: macOS version and chip
      placeholder: "macOS 15.5, M2 Pro"
    validations:
      required: true
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: What did you do, what did you expect, what happened instead?
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs
      description: >
        Attach `beaver.log` and `mlx-server.log` from
        `~/Library/Logs/se.djtl.beaver/` if you can — they contain no capture
        content, only setup/runtime diagnostics.
```

`.github/ISSUE_TEMPLATE/feature_request.yml`:

```yaml
name: Feature request
description: An idea that would make Beaver better
labels: [enhancement]
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem would this solve?
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: What would you like to happen?
    validations:
      required: true
```

`.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## What

<!-- What does this change and why? -->

## How was it tested?

<!-- pnpm test:run / cargo test / python test_mlx_server.py, plus manual steps -->

## Checklist

- [ ] Tests pass locally (`pnpm test:run`, `cargo test`, Python server tests)
- [ ] Changes to Tauri permissions, entitlements, or network behavior are called out above
```

- [ ] **Step 3: README, SECURITY, CONTRIBUTING updates**

README — under the intro paragraph, add a demo section (commented image until the asset exists so the launch page never shows a broken image):

```markdown
<!-- Demo assets: record with the capture flow + popover, save to docs/media/demo.gif, then uncomment.
![Beaver turning a screenshot region into Markdown](docs/media/demo.gif)
-->
```

README — replace the sentence "everything after runs offline" (line ~32) with:

```markdown
bar tracks the download; extraction then runs fully offline. The only later
network call is an optional once-a-day version check against GitHub Releases
(no capture data, ever) — set `BEAVER_DISABLE_UPDATE_CHECK=1` to turn it off.
```

README — add a Troubleshooting section before "Security and Contributing":

```markdown
## Troubleshooting

- Logs live in `~/Library/Logs/se.djtl.beaver/` (`beaver.log` for the app,
  `mlx-server.log` for the vision server). Attach both to bug reports.
- If captures return a permission message, enable Beaver under
  **System Settings → Privacy & Security → Screen Recording** and relaunch.
- If setup fails, the onboarding screen shows the reason and a **Try again**
  button; the menu-bar popover shows the same when Beaver is already set up.
```

SECURITY.md — append to the security-model section:

```markdown
- Update visibility: Beaver asks `api.github.com` for the latest release tag at
  most once per day, only when the popover opens. The request carries no
  capture data or identifiers beyond a generic user agent, and
  `BEAVER_DISABLE_UPDATE_CHECK=1` disables it entirely.
```

CONTRIBUTING.md — append:

```markdown
## Python dependencies

`src-tauri/resources/requirements.txt` is the human-edited source;
`requirements.lock` is what ships. After changing requirements, regenerate:

```bash
cd src-tauri/resources
uv pip compile requirements.txt -o requirements.lock --python-version 3.12
```

## Cutting a release

1. Update the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
   and `package.json`; add a `CHANGELOG.md` entry with the date.
2. Merge to `main` with CI green.
3. Run the **Release macOS** workflow with the tag (e.g. `v0.1.0`) — it builds,
   signs, notarizes, and attaches the DMG to a draft release.
4. Edit the draft's notes from the changelog and publish.
```

- [ ] **Step 4: Verify + commit**

Run: `pnpm test:run` (README/doc changes shouldn't break anything; `release-script.test.ts` greps docs — confirm it still passes).

```bash
git add CHANGELOG.md .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md README.md SECURITY.md CONTRIBUTING.md
git commit -m "docs: changelog, issue templates, troubleshooting, release checklist"
```

---

### Task 14: Verification matrix + release sequence

This task is a gate, not code. Run everything; fix regressions before proceeding.

- [ ] **Step 1: Full automated suite**

```bash
pnpm test:run && pnpm build && pnpm website:typecheck && pnpm website:test
cd src-tauri && cargo test && cd ..
cd src-tauri/resources && uv run --no-project --with fastapi --with uvicorn --with pydantic --with tqdm python test_mlx_server.py && cd ../..
```

Expected: all pass.

- [ ] **Step 2: Manual matrix (requires the human — coordinate with the user)**

1. **Fresh onboarding happy path:** move `~/Library/Application Support/se.djtl.beaver` aside, `pnpm tauri dev` → welcome → download w/ progress → (permission step if not granted) → ready → popover opens.
2. **Failure + retry:** relaunch fresh, kill Wi-Fi mid-download → error screen shows a reason → restore Wi-Fi → **Try again** → completes.
3. **Permission flow:** remove Beaver from Screen Recording in System Settings → capture shows the permission toast; popover shows the banner; grant → relaunch → capture works.
4. **Orphan check:** with the server ready, force-quit Beaver (`kill -9`) → within ~5s `pgrep -f mlx_server.py` returns nothing.
5. **Disk preflight:** temporarily set `SETUP_DISK_NEEDED_BYTES` sanity-check via a fresh run on a machine with enough space (message path already unit-tested; observing the happy path suffices).
6. **CSP smoke:** no CSP violations in the webview console across onboarding, popover, capture.
7. **Update pill:** run with a locally-lowered version (set `version` to `0.0.1` in `tauri.conf.json` temporarily) → pill appears once a real release exists; revert.
8. **Release build:** `pnpm release:mac` → DMG installs, app passes Gatekeeper (signed) or opens via right-click (unsigned).

- [ ] **Step 3: Release sequence**

1. Open a PR from this branch to `main`; CI green; merge.
2. Fill the `CHANGELOG.md` date; run the **Release macOS** workflow with `tag_name: v0.1.0`.
3. Record the README demo GIF (human), save to `docs/media/demo.gif`, uncomment the README image, commit.
4. Publish the draft release; make the repo public; set topics (`macos`, `tauri`, `mlx`, `ocr`, `screenshot`, `markdown`, `on-device-ai`) and the social preview image; confirm the website's download CTA (`apps/website/src/constants.ts` → `releases/latest`) resolves to the DMG.
