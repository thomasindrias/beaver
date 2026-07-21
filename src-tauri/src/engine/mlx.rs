//! MLX backend (Apple Silicon): `mlx_server.py`, a Python FastAPI server
//! running the vision model via mlx-vlm inside an app-managed venv. Owns the
//! whole lifecycle — venv/deps provisioning, process spawn, and the HTTP
//! client for the server's custom API.

use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::time::Duration;

use crate::engine::{api_url, HealthStatus};
use crate::server::{app_data, open_server_log, resolve_resource};

/// Where the app keeps its self-contained MLX environment + model cache.
/// Everything lives under the Tauri app-data dir so uninstall is clean.
const VENV_DIRNAME: &str = "mlx-venv";
const HF_DIRNAME: &str = "hf-cache";
const UV_CACHE_DIRNAME: &str = "uv-cache";
const UV_PYTHON_DIRNAME: &str = "uv-python";

fn venv_python(app: &tauri::AppHandle) -> PathBuf {
    app_data(app).join(VENV_DIRNAME).join("bin").join("python")
}

fn hf_home(app: &tauri::AppHandle) -> PathBuf {
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
/// app-data cache and stdout/stderr appended to the shared engine log so
/// first-run failures are diagnosable in the field. Returns the child handle.
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
pub async fn extract_from_image(
    port: u16,
    image_base64: &str,
    prompt: &str,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let body = serde_json::json!({
        "image_base64": image_base64,
        "prompt": prompt,
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
