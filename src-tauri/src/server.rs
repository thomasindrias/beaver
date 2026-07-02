use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::AtomicBool;
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

/// Marker written inside the venv after deps install successfully. `uv venv`
/// alone creates the venv python, so the python existing does NOT mean the
/// slow, interruptible `uv pip install` finished. Without this, an interrupted
/// first run leaves a python-but-no-packages venv that looks ready, so the
/// install is skipped on the next launch and the server crashes on import.
/// Keeping the marker inside the venv dir means wiping the venv also clears it.
fn deps_marker(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(VENV_DIRNAME).join(".beaver-deps-installed")
}

pub fn env_is_ready(app: &tauri::AppHandle) -> bool {
    deps_marker(app).exists()
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
    // Resource copies don't always keep the exec bit; restore it only when it's
    // actually missing. Re-chmodding an already-executable binary needlessly
    // touches the file, which makes the `tauri dev` file-watcher rebuild the
    // app mid-setup (it watches src-tauri/, where the bundled uv lives).
    if let Ok(meta) = std::fs::metadata(&uv) {
        if meta.permissions().mode() & 0o111 == 0 {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&uv, perms);
        }
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

    std::fs::write(deps_marker(app), b"1").map_err(|e| format!("write deps marker: {e}"))?;
    Ok(())
}

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

/// Spawn the MLX server using the venv's Python, with HF_HOME pinned to the
/// app-data cache and stdout/stderr appended to mlx-server.log so first-run
/// failures are diagnosable in the field. Returns the child handle.
pub fn spawn_server(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let python = venv_python(app);
    let script = resolve_resource(app, "mlx_server.py");
    let mut cmd = Command::new(python);
    cmd.args(server_args(&script, port, std::process::id()))
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

    #[test]
    fn disk_has_room_boundary() {
        assert!(disk_has_room(SETUP_DISK_NEEDED_BYTES));
        assert!(!disk_has_room(SETUP_DISK_NEEDED_BYTES - 1));
    }

    #[test]
    fn insufficient_disk_message_names_the_size() {
        assert!(insufficient_disk_message().contains("8 GB"));
    }
}
