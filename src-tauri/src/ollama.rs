pub const OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434";
pub const MODEL_NAME: &str = "qwen2.5vl:3b";

// How long Ollama keeps the vision model resident after a request. A short
// idle window means a burst of captures reuses the already-loaded model (no
// repeated cold-start), while still freeing the ~several-GB footprint once the
// user stops capturing. keep_alive:0 (unload immediately) made every single
// capture pay the full load cost.
pub const KEEP_ALIVE: &str = "90s";

pub fn api_url(path: &str) -> String {
    format!("{}{}", OLLAMA_BASE_URL, path)
}

pub async fn is_running() -> bool {
    reqwest::get(api_url("/api/tags")).await.is_ok()
}

#[derive(serde::Deserialize)]
struct OllamaModel {
    name: String,
}

#[derive(serde::Deserialize)]
struct TagsResponse {
    models: Vec<OllamaModel>,
}

pub async fn is_model_installed() -> bool {
    let Ok(resp) = reqwest::get(api_url("/api/tags")).await else {
        return false;
    };
    let Ok(tags) = resp.json::<TagsResponse>().await else {
        return false;
    };
    tags.models.iter().any(|m| m.name.starts_with(MODEL_NAME))
}

#[cfg(test)]
fn has_table_separator(markdown: &str) -> bool {
    use std::sync::OnceLock;
    use regex::Regex;
    static TABLE_RE: OnceLock<Regex> = OnceLock::new();
    let re = TABLE_RE.get_or_init(|| Regex::new(r"\|[-: ]+\|").expect("valid regex"));
    re.is_match(markdown)
}

#[cfg(test)]
pub fn detect_content_type(markdown: &str) -> &'static str {
    let has_table = has_table_separator(markdown);
    let has_code = markdown.contains("```");
    let has_list = markdown
        .lines()
        .any(|l| l.trim_start().starts_with("- ") || l.trim_start().starts_with("* "));

    match (has_table, has_code, has_list) {
        (true, false, false) => "table",
        (false, true, false) => "code",
        (false, false, true) => "list",
        (false, false, false) => "prose",
        _ => "mixed",
    }
}

const EXTRACTION_PROMPT: &str =
    "Extract all data visible in this image. Return as Markdown only. \
     Preserve structure exactly: tables as Markdown tables, lists as Markdown lists, \
     code in fenced code blocks with language hints. \
     Output only the extracted content — no commentary or explanation.";

#[derive(serde::Deserialize)]
struct GenerateResponse {
    response: String,
}

pub async fn extract_from_image(image_base64: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let body = serde_json::json!({
        "model": MODEL_NAME,
        "prompt": EXTRACTION_PROMPT,
        "images": [image_base64],
        "stream": false,
        // Hold the model for a short window so a burst of captures stays fast,
        // then let Ollama free the RAM. See KEEP_ALIVE.
        "keep_alive": KEEP_ALIVE
    });

    let resp = client
        .post(api_url("/api/generate"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {e}"))?;

    let result: GenerateResponse = resp
        .error_for_status()
        .map_err(|e| format!("Ollama returned error status: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {e}"))?;

    Ok(result.response.trim().to_string())
}

/// Loads the model into memory ahead of an extraction. Fired when the capture
/// overlay opens, so the cold-load happens while the user is selecting a region.
/// Uses the same KEEP_ALIVE window as extraction so the model stays resident
/// from warm-up through the request and any follow-up captures.
pub async fn warm_model() {
    let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
    else {
        return;
    };
    // An empty prompt makes Ollama load the model and return without generating.
    let _ = client
        .post(api_url("/api/generate"))
        .json(&serde_json::json!({ "model": MODEL_NAME, "keep_alive": KEEP_ALIVE }))
        .send()
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_url_builds_correctly() {
        assert_eq!(api_url("/api/tags"), "http://127.0.0.1:11434/api/tags");
    }

    #[test]
    fn model_name_is_correct() {
        assert_eq!(MODEL_NAME, "qwen2.5vl:3b");
    }

    #[test]
    fn base_url_uses_localhost_port() {
        assert!(OLLAMA_BASE_URL.contains("127.0.0.1:11434"));
    }

    #[test]
    fn detects_table() {
        // Basic separator
        assert_eq!(detect_content_type("| A | B |\n|---|---|\n| 1 | 2 |"), "table");
        // Varied separator with spaces
        assert_eq!(detect_content_type("| Name | Value |\n| --- | --- |\n| foo | bar |"), "table");
        // Alignment markers
        assert_eq!(detect_content_type("| Left | Center |\n|:---|:---:|\n| a | b |"), "table");
    }

    #[test]
    fn detects_code() {
        assert_eq!(detect_content_type("```rust\nfn main() {}\n```"), "code");
    }

    #[test]
    fn detects_list() {
        assert_eq!(detect_content_type("- item one\n- item two"), "list");
    }

    #[test]
    fn detects_prose() {
        assert_eq!(detect_content_type("Just a paragraph of plain text."), "prose");
    }

    #[test]
    fn detects_mixed() {
        assert_eq!(detect_content_type("Some text\n\n- list\n\n```code```"), "mixed");
    }
}
