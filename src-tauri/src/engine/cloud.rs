//! BYO-cloud backend: any OpenAI-compatible `/v1/chat/completions` endpoint,
//! reached over HTTPS with a user-supplied base URL, model, and API key.
//!
//! Unlike the local backends this owns no lifecycle — there is no process to
//! spawn, nothing to provision, no port, and no health to poll. It implements
//! only `extract_from_image`, which is the single operation that varies
//! between engines at capture time.
//!
//! The request shape is deliberately identical to `llamacpp.rs`'s, since both
//! speak the same OpenAI-compatible schema; the differences are a configurable
//! model, an absolute URL instead of a localhost port, and a bearer token.

use std::time::Duration;

/// Where to send a cloud extraction and how to authenticate it.
///
/// `Debug` is implemented by hand so the key cannot reach a log line through
/// an incidental `{:?}`.
pub struct Config {
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}

impl std::fmt::Debug for Config {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Config")
            .field("base_url", &self.base_url)
            .field("model", &self.model)
            .field("api_key", &"<redacted>")
            .finish()
    }
}

/// Join a user-supplied base URL with the chat-completions path. Providers are
/// inconsistent about the trailing slash — Gemini documents one, OpenAI does
/// not — so normalize rather than concatenate.
pub fn chat_completions_url(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

/// Map an HTTP status to a short, user-readable cause.
///
/// This takes only the status code: provider error bodies are deliberately not
/// forwarded, because some providers echo request context into them, and the
/// HUD is not a place to render a stranger's JSON. Taking no `Config` also
/// means the API key cannot reach a message from here by construction.
fn map_error_status(status: u16) -> String {
    match status {
        401 | 403 => "Provider rejected the API key".to_string(),
        429 => "Provider rate limit reached".to_string(),
        s if (500..600).contains(&s) => "Provider is unavailable".to_string(),
        s => format!("Provider error (HTTP {s})"),
    }
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
    model: String,
    messages: Vec<ChatMessage>,
    max_tokens: u32,
}

fn build_request(model: &str, image_base64: &str, prompt: &str) -> ChatRequest {
    ChatRequest {
        model: model.to_string(),
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

fn first_choice(resp: ChatResponse) -> Result<String, String> {
    resp.choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .ok_or_else(|| "Provider returned an empty response".to_string())
}

/// POST `<base_url>/chat/completions`. Returns the extracted text, or a
/// user-readable error — the same `Result<String, String>` contract as
/// `local::extract_from_image`.
///
/// The 120s timeout is shorter than the local engine's 180s: a cloud round
/// trip that exceeds two minutes is a failure worth reporting rather than
/// waiting on.
pub async fn extract_from_image(
    cfg: &Config,
    image_base64: &str,
    prompt: &str,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let body = build_request(&cfg.model, image_base64, prompt);
    let resp = client
        .post(chat_completions_url(&cfg.base_url))
        .bearer_auth(&cfg.api_key)
        .json(&body)
        .send()
        .await
        // The transport error is intentionally not interpolated: a user may
        // paste a base URL carrying a secret in its query string, and reqwest's
        // Display includes the URL.
        .map_err(|_| "Couldn't reach the provider".to_string())?;
    if !resp.status().is_success() {
        return Err(map_error_status(resp.status().as_u16()));
    }
    let parsed: ChatResponse = resp
        .json()
        .await
        .map_err(|_| "Provider returned an unreadable response".to_string())?;
    first_choice(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> Config {
        Config {
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
            api_key: "sk-secret-do-not-leak".to_string(),
        }
    }

    #[test]
    fn chat_completions_url_appends_the_path() {
        assert_eq!(
            chat_completions_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn chat_completions_url_tolerates_a_trailing_slash() {
        // Gemini documents its base URL with a trailing slash; OpenAI without.
        assert_eq!(
            chat_completions_url("https://generativelanguage.googleapis.com/v1beta/openai/"),
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        );
    }

    #[test]
    fn chat_completions_url_collapses_repeated_trailing_slashes() {
        assert_eq!(
            chat_completions_url("https://example.com/v1///"),
            "https://example.com/v1/chat/completions"
        );
    }

    #[test]
    fn build_request_shapes_image_and_text_content_parts() {
        let req = build_request("gpt-4o-mini", "QUJD", "Extract as Markdown.");
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
    fn build_request_uses_the_configured_model() {
        let req = build_request("claude-haiku-4-5-20251001", "QUJD", "p");
        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["model"], "claude-haiku-4-5-20251001");
    }

    #[test]
    fn map_error_status_reports_a_rejected_key() {
        assert_eq!(map_error_status(401), "Provider rejected the API key");
        assert_eq!(map_error_status(403), "Provider rejected the API key");
    }

    #[test]
    fn map_error_status_reports_rate_limiting() {
        assert_eq!(map_error_status(429), "Provider rate limit reached");
    }

    #[test]
    fn map_error_status_reports_provider_outages() {
        assert_eq!(map_error_status(500), "Provider is unavailable");
        assert_eq!(map_error_status(503), "Provider is unavailable");
    }

    #[test]
    fn map_error_status_falls_back_to_the_status_code() {
        assert_eq!(map_error_status(404), "Provider error (HTTP 404)");
    }

    #[test]
    fn chat_response_extracts_the_first_choice() {
        let raw = r#"{"choices":[{"message":{"content":" | a | b |\n"}}]}"#;
        let parsed: ChatResponse = serde_json::from_str(raw).unwrap();
        assert_eq!(first_choice(parsed).unwrap(), "| a | b |");
    }

    #[test]
    fn first_choice_errors_on_an_empty_choices_array() {
        let parsed: ChatResponse = serde_json::from_str(r#"{"choices":[]}"#).unwrap();
        assert_eq!(
            first_choice(parsed).unwrap_err(),
            "Provider returned an empty response"
        );
    }

    // The API key reaches this struct, so anything that formats it is a leak
    // vector: a stray `log::debug!("{cfg:?}")` would put the key in the log
    // file. Debug is hand-written to redact it.
    #[test]
    fn debug_redacts_the_api_key() {
        let rendered = format!("{:?}", cfg());
        assert!(!rendered.contains("sk-secret-do-not-leak"), "key leaked: {rendered}");
        assert!(rendered.contains("<redacted>"));
        assert!(rendered.contains("gpt-4o-mini"));
    }
}
