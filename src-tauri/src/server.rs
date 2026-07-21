//! Engine-neutral supervision of the local engine server: setup
//! orchestration and its observable state, app-data paths and markers, and
//! shared helpers the engine backends build on. Everything backend-specific
//! (venv vs. model download, spawn arguments, health protocol) lives in
//! `engine/`.

use std::path::PathBuf;
use std::process::Child;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use tauri::Manager;

use crate::engine;

/// Coarse setup phase tracked on the Rust side. The fine-grained
/// downloading/loading/ready states come from the engine server's /health.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SetupPhase {
    BuildingEnv,
    StartingServer,
    ServerUp,
    Failed,
}

/// Managed app state for the local engine server: the localhost port, the
/// child process handle, and the current setup phase.
pub struct EngineState {
    pub port: u16,
    pub child: Mutex<Option<Child>>,
    pub phase: Mutex<SetupPhase>,
    /// Short user-readable reason when phase == Failed.
    pub failure: Mutex<Option<String>>,
    /// Guards against stacked setup threads on rapid retries.
    pub setup_running: AtomicBool,
    /// Model-download progress (0.0-1.0) during `SetupPhase::BuildingEnv`.
    /// Only ever populated by the llama.cpp backend's `build_env`, which
    /// downloads the model before spawning the server; the MLX `build_env`
    /// leaves it `None` — MLX's own download progress is reported later,
    /// through `health` during `StartingServer`.
    pub download_progress: Mutex<Option<f64>>,
}

impl EngineState {
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

    /// Record a setup failure with a reason the UI can show.
    pub fn fail(&self, msg: String) {
        log::error!("setup failed: {msg}");
        *self.failure.lock().unwrap() = Some(msg);
        *self.phase.lock().unwrap() = SetupPhase::Failed;
    }
}

/// Bind to port 0 to let the OS pick a free port, then drop the listener so the
/// port is available for the server to claim. Localhost-only; the tiny TOCTOU
/// window is acceptable here.
pub fn free_port() -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    Ok(port)
}

pub(crate) fn app_data(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir must resolve")
}

pub fn update_cache_path(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join("update-check.json")
}

/// Marker written after the server first reaches `ready`. This is the source of
/// truth for "setup has completed at least once" — more reliable than probing
/// the model cache dir, which exists mid-download (an interrupted first run
/// would otherwise look complete and skip the onboarding progress UI).
pub fn setup_marker(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(".setup-complete")
}

pub fn setup_is_complete(app: &tauri::AppHandle) -> bool {
    setup_marker(app).exists()
}

pub fn mark_setup_complete(app: &tauri::AppHandle) {
    if let Err(e) = std::fs::write(setup_marker(app), b"1") {
        log::error!("failed to write setup marker: {e}");
    }
}

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

/// Resolve a bundled resource. In debug builds resources aren't copied to a
/// bundle, so read them from the crate's `resources/` dir; in release read from
/// the app's resource dir.
pub(crate) fn resolve_resource(app: &tauri::AppHandle, name: &str) -> PathBuf {
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

pub const SERVER_LOG_FILENAME: &str = "engine-server.log";

/// Open (stdout, stderr) handles onto the shared engine log, appending.
/// Best-effort: `None` means logging is skipped, never a hard failure.
pub(crate) fn open_server_log(app: &tauri::AppHandle) -> Option<(std::fs::File, std::fs::File)> {
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

/// First-run setup needs headroom for either engine's first download: MLX's
/// venv (~2 GB) + model (~3 GB), or llama.cpp's GGUF model + mmproj (~5.7 GB).
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

/// Build the env (first run), spawn the engine server, and poll it to
/// readiness — all off the main thread. Re-runnable: `retry_setup` calls this
/// again after a failure. The `setup_running` flag makes concurrent calls a
/// no-op.
pub fn spawn_setup(handle: tauri::AppHandle) {
    {
        let state = handle.state::<EngineState>();
        if state
            .setup_running
            .swap(true, std::sync::atomic::Ordering::SeqCst)
        {
            return; // a setup pass is already in flight
        }
        *state.failure.lock().unwrap() = None;
        *state.phase.lock().unwrap() = SetupPhase::BuildingEnv;
        // A retry after a spawn-then-crash leaves a stale child; reap it.
        if let Ok(mut guard) = state.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        };
    }

    std::thread::spawn(move || {
        // Clear the running flag on every exit path, including panics —
        // otherwise a single panicked setup pass would permanently disable
        // retry_setup for the rest of the process's life.
        struct ClearRunningOnExit(tauri::AppHandle);
        impl Drop for ClearRunningOnExit {
            fn drop(&mut self) {
                let state = self.0.state::<EngineState>();
                state
                    .setup_running
                    .store(false, std::sync::atomic::Ordering::SeqCst);
            }
        }
        let _clear_running = ClearRunningOnExit(handle.clone());

        let state = handle.state::<EngineState>();

        if !engine::local::env_is_ready(&handle) {
            if let Err(msg) = preflight_disk(&handle) {
                state.fail(msg);
                return;
            }
            if let Err(e) = engine::local::build_env(&handle) {
                state.fail(format!(
                    "Couldn't prepare the on-device model environment. Check your \
                     internet connection and try again. ({e})"
                ));
                return;
            }
        }

        *state.phase.lock().unwrap() = SetupPhase::StartingServer;
        match engine::local::spawn_server(&handle, state.port) {
            Ok(child) => {
                *state.child.lock().unwrap() = Some(child);
            }
            Err(e) => {
                state.fail(format!("Couldn't start the on-device model server. ({e})"));
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
            match tauri::async_runtime::block_on(engine::local::health(state.port)) {
                Ok(h) => {
                    last_reachable = std::time::Instant::now();
                    match h.status {
                        engine::ServerStatus::Ready => {
                            *state.phase.lock().unwrap() = SetupPhase::ServerUp;
                            mark_setup_complete(&handle);
                            break;
                        }
                        engine::ServerStatus::Error => {
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
    });
}

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

    #[test]
    fn new_engine_state_starts_in_building_env_with_no_failure() {
        let s = EngineState::new(11500);
        assert_eq!(*s.phase.lock().unwrap(), SetupPhase::BuildingEnv);
        assert!(s.failure.lock().unwrap().is_none());
        assert!(!s.setup_running.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn fail_sets_phase_and_stores_reason() {
        let s = EngineState::new(11500);
        s.fail("network burped".to_string());
        assert_eq!(*s.phase.lock().unwrap(), SetupPhase::Failed);
        assert_eq!(s.failure.lock().unwrap().as_deref(), Some("network burped"));
    }

    #[test]
    fn disk_has_room_boundary() {
        assert!(disk_has_room(SETUP_DISK_NEEDED_BYTES));
        assert!(!disk_has_room(SETUP_DISK_NEEDED_BYTES - 1));
    }

    #[test]
    fn insufficient_disk_message_names_the_size() {
        assert!(insufficient_disk_message().contains("8 GB"));
    }

    #[test]
    fn new_engine_state_starts_with_no_download_progress() {
        let s = EngineState::new(11500);
        assert!(s.download_progress.lock().unwrap().is_none());
    }
}
