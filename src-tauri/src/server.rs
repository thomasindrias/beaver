use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use tauri::Manager;

/// Where the app keeps its self-contained MLX environment + model cache.
/// Everything lives under the Tauri app-data dir so uninstall is clean.
#[cfg(target_arch = "aarch64")]
const VENV_DIRNAME: &str = "mlx-venv";
#[cfg(target_arch = "aarch64")]
const HF_DIRNAME: &str = "hf-cache";
#[cfg(target_arch = "aarch64")]
const UV_CACHE_DIRNAME: &str = "uv-cache";
#[cfg(target_arch = "aarch64")]
const UV_PYTHON_DIRNAME: &str = "uv-python";

/// Where the app keeps its downloaded GGUF model + mmproj for the llama.cpp
/// engine. Lives under the Tauri app-data dir so uninstall is clean.
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
/// Pinned expected sizes (bytes) for the two downloads, per the implementation
/// plan's Global Constraints section. The download URLs point at `main`, not a
/// pinned commit, so a size mismatch is the signal that the upstream file
/// changed underneath us — see `download_with_progress`'s fail-fast check.
#[cfg(target_arch = "x86_64")]
const GGUF_MODEL_SIZE_BYTES: u64 = 4_681_089_344;
#[cfg(target_arch = "x86_64")]
const MMPROJ_SIZE_BYTES: u64 = 1_044_425_152;

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

pub fn update_cache_path(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join("update-check.json")
}

#[cfg(target_arch = "aarch64")]
pub fn venv_python(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(VENV_DIRNAME).join("bin").join("python")
}

#[cfg(target_arch = "aarch64")]
pub fn hf_home(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(HF_DIRNAME)
}

/// Marker written inside the venv after deps install successfully. `uv venv`
/// alone creates the venv python, so the python existing does NOT mean the
/// slow, interruptible `uv pip install` finished. Without this, an interrupted
/// first run leaves a python-but-no-packages venv that looks ready, so the
/// install is skipped on the next launch and the server crashes on import.
/// Keeping the marker inside the venv dir means wiping the venv also clears it.
#[cfg(target_arch = "aarch64")]
fn deps_marker(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(VENV_DIRNAME).join(".beaver-deps-installed")
}

#[cfg(target_arch = "aarch64")]
pub fn env_is_ready(app: &tauri::AppHandle) -> bool {
    deps_marker(app).exists()
}

#[cfg(target_arch = "x86_64")]
pub fn env_is_ready(app: &tauri::AppHandle) -> bool {
    let dir = app_data(app).join(MODEL_DIRNAME);
    dir.join(GGUF_MODEL_FILENAME).exists() && dir.join(MMPROJ_FILENAME).exists()
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

#[cfg(target_arch = "aarch64")]
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
#[cfg(target_arch = "aarch64")]
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

    let req = resolve_resource(app, "requirements.lock");
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

#[cfg(target_arch = "x86_64")]
fn download_fraction(downloaded: u64, total: u64) -> f64 {
    if total == 0 {
        return 1.0;
    }
    (downloaded as f64 / total as f64).min(1.0)
}

/// Whether a download should be considered complete: the byte count must
/// match the expected total exactly, or the total must be unknown (no
/// `Content-Length` header) — mirroring `download_fraction`'s own handling
/// of `total: Option<u64>` for the progress percentage.
#[cfg(target_arch = "x86_64")]
fn download_is_complete(downloaded: u64, total: Option<u64>) -> bool {
    total.map_or(true, |t| downloaded == t)
}

/// Downloads to a temporary `.part` file next to `dest`, then atomically
/// renames it into place only once the byte count is verified complete.
/// This keeps a crash or power loss mid-download from ever leaving a
/// truncated file at `dest` — callers that only check `dest.exists()` (see
/// `build_env`'s early-return) must never observe a partial download there.
///
/// `expected_size` is the caller's pinned, known-correct size for `url` (see
/// `GGUF_MODEL_SIZE_BYTES` / `MMPROJ_SIZE_BYTES`). It's used two ways: first,
/// to fail fast if the server's own `Content-Length` disagrees (a sign the
/// upstream file changed since it was validated); then, as the sole source of
/// truth for progress and completeness, independent of whether the server
/// even sends `Content-Length` at all.
#[cfg(target_arch = "x86_64")]
async fn download_with_progress(
    client: &reqwest::Client,
    url: &str,
    dest: &std::path::Path,
    expected_size: u64,
    progress: &Mutex<Option<f64>>,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let tmp_dest = dest.with_extension("part");

    let mut resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("download failed: {e}"))?;
    if let Some(reported) = resp.content_length() {
        if reported != expected_size {
            return Err(format!(
                "unexpected download size for {}: server reports {reported} bytes, expected \
                 {expected_size} (the source file may have changed)",
                dest.display()
            ));
        }
    }
    let mut file = tokio::fs::File::create(&tmp_dest)
        .await
        .map_err(|e| format!("create {}: {e}", tmp_dest.display()))?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("download chunk failed: {e}"))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("write {}: {e}", tmp_dest.display()))?;
        downloaded += chunk.len() as u64;
        *progress.lock().unwrap() = Some(download_fraction(downloaded, expected_size));
    }
    drop(file);

    if !download_is_complete(downloaded, Some(expected_size)) {
        let _ = tokio::fs::remove_file(&tmp_dest).await;
        return Err(format!(
            "download incomplete: got {downloaded} of {expected_size} bytes for {}",
            dest.display()
        ));
    }

    tokio::fs::rename(&tmp_dest, dest)
        .await
        .map_err(|e| format!("rename {} to {}: {e}", tmp_dest.display(), dest.display()))?;
    Ok(())
}

/// Downloads the GGUF model + mmproj (skipped if already present — an
/// interrupted first run resumes cleanly on the next launch since it
/// re-downloads only what's missing) and verifies the bundled `llama-server`
/// binary is executable. No venv, no pip install — see the module doc.
#[cfg(target_arch = "x86_64")]
pub fn build_env(app: &tauri::AppHandle) -> Result<(), String> {
    let llama_server = resolve_resource(app, "llama/llama-server");
    if !llama_server.exists() {
        return Err(format!(
            "bundled llama-server binary not found at {} — this build is missing the \
             resources/llama bundle",
            llama_server.display()
        ));
    }
    if let Ok(meta) = std::fs::metadata(&llama_server) {
        if meta.permissions().mode() & 0o111 == 0 {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(&llama_server, perms);
        }
    }

    let data = app_data(app);
    std::fs::create_dir_all(&data).map_err(|e| format!("create app data dir: {e}"))?;

    let models_dir = data.join(MODEL_DIRNAME);
    std::fs::create_dir_all(&models_dir).map_err(|e| format!("create models dir: {e}"))?;
    let model_path = models_dir.join(GGUF_MODEL_FILENAME);
    let mmproj_path = models_dir.join(MMPROJ_FILENAME);

    let state = app.state::<MlxServer>();
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("build download client: {e}"))?;
    if !model_path.exists() {
        tauri::async_runtime::block_on(download_with_progress(
            &client,
            GGUF_MODEL_URL,
            &model_path,
            GGUF_MODEL_SIZE_BYTES,
            &state.download_progress,
        ))?;
    }
    if !mmproj_path.exists() {
        tauri::async_runtime::block_on(download_with_progress(
            &client,
            MMPROJ_URL,
            &mmproj_path,
            MMPROJ_SIZE_BYTES,
            &state.download_progress,
        ))?;
    }
    Ok(())
}

/// Argument vector for the MLX server process. Extracted for testability.
#[cfg(target_arch = "aarch64")]
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
/// app-data cache and stdout/stderr appended to the shared engine log so
/// first-run failures are diagnosable in the field. Returns the child handle.
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

/// Spawn the bundled `llama-server` binary against the downloaded GGUF model
/// and mmproj, with stdout/stderr appended to the shared engine log. Returns
/// the child handle.
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

    #[cfg(target_arch = "aarch64")]
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

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn download_is_complete_when_sizes_match() {
        assert!(download_is_complete(200, Some(200)));
    }

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn download_is_complete_false_when_truncated() {
        assert!(!download_is_complete(150, Some(200)));
    }

    #[cfg(target_arch = "x86_64")]
    #[test]
    fn download_is_complete_when_total_unknown() {
        assert!(download_is_complete(150, None));
    }

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
}
