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
    #[allow(dead_code)]
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
