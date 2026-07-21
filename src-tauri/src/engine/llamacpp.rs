//! llama.cpp backend (Intel Mac): the bundled `llama-server` binary running a
//! quantized GGUF vision model. Owns the whole lifecycle — model download,
//! process spawn, and the HTTP client for llama-server's OpenAI-compatible
//! API.
//!
//! Unlike MLX, the model is downloaded by Rust *before* the server process
//! spawns, so `health()` never reports `Downloading` — that phase surfaces
//! through `server.rs`'s download progress instead.

use std::os::unix::fs::PermissionsExt;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

use crate::engine::{api_url, HealthStatus, ServerStatus};
use crate::server::{app_data, open_server_log, resolve_resource, EngineState};

/// Where the app keeps its downloaded GGUF model + mmproj. Lives under the
/// Tauri app-data dir so uninstall is clean.
const MODEL_DIRNAME: &str = "models";
const GGUF_MODEL_FILENAME: &str = "minicpm-v-2_6-q4_k_m.gguf";
const MMPROJ_FILENAME: &str = "minicpm-v-2_6-mmproj-f16.gguf";
const GGUF_MODEL_URL: &str =
    "https://huggingface.co/openbmb/MiniCPM-V-2_6-gguf/resolve/main/ggml-model-Q4_K_M.gguf";
const MMPROJ_URL: &str =
    "https://huggingface.co/openbmb/MiniCPM-V-2_6-gguf/resolve/main/mmproj-model-f16.gguf";
/// Pinned expected sizes (bytes) for the two downloads. The download URLs
/// point at `main`, not a pinned commit, so a size mismatch is the signal that
/// the upstream file changed underneath us — see `download_with_progress`'s
/// fail-fast check.
const GGUF_MODEL_SIZE_BYTES: u64 = 4_681_089_344;
const MMPROJ_SIZE_BYTES: u64 = 1_044_425_152;

pub fn env_is_ready(app: &tauri::AppHandle) -> bool {
    let dir = app_data(app).join(MODEL_DIRNAME);
    dir.join(GGUF_MODEL_FILENAME).exists() && dir.join(MMPROJ_FILENAME).exists()
}

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

    let state = app.state::<EngineState>();
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

/// Spawn the bundled `llama-server` binary against the downloaded GGUF model
/// and mmproj, with stdout/stderr appended to the shared engine log. Returns
/// the child handle.
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

    #[test]
    fn download_fraction_computes_ratio() {
        assert_eq!(download_fraction(50, 200), 0.25);
    }

    #[test]
    fn download_fraction_clamps_to_one() {
        assert_eq!(download_fraction(300, 200), 1.0);
    }

    #[test]
    fn download_fraction_avoids_division_by_zero() {
        assert_eq!(download_fraction(0, 0), 1.0);
    }

    #[test]
    fn download_is_complete_when_sizes_match() {
        assert!(download_is_complete(200, Some(200)));
    }

    #[test]
    fn download_is_complete_false_when_truncated() {
        assert!(!download_is_complete(150, Some(200)));
    }

    #[test]
    fn download_is_complete_when_total_unknown() {
        assert!(download_is_complete(150, None));
    }

    fn llama_resource_dir() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join("llama")
    }

    #[test]
    fn llama_server_binary_is_bundled_and_executable() {
        let bin = llama_resource_dir().join("llama-server");
        assert!(bin.exists(), "expected {} to exist", bin.display());
        let meta = std::fs::metadata(&bin).unwrap();
        assert!(meta.permissions().mode() & 0o111 != 0, "llama-server must be executable");
    }

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

    /// End-to-end proof against a real `llama-server`. Ignored by default
    /// (spawns a real process and needs a real GGUF model on disk) — the
    /// Intel CI workflow runs it explicitly with `BEAVER_TEST_GGUF_MODEL` /
    /// `BEAVER_TEST_MMPROJ` pointed at a cached model. Skips locally if those
    /// env vars aren't set, so a plain `cargo test --target
    /// x86_64-apple-darwin` never tries to spawn a multi-GB download.
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
        .expect("fixture image must exist");
        let image_base64 = STANDARD.encode(&fixture);
        let prompt = crate::prompts::prompt_for(crate::prompts::ExtractFormat::Markdown, None);

        let result = extract_from_image(port, &image_base64, &prompt)
            .await
            .expect("extraction must succeed");

        let _ = child.kill();

        assert!(result.contains('|'), "expected a Markdown table separator in: {result}");
    }
}
