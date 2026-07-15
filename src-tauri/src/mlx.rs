use std::time::Duration;

pub const EXTRACTION_PROMPT: &str =
    "Extract all data visible in this image. Return as Markdown only. \
     Preserve structure exactly: tables as Markdown tables, lists as Markdown lists, \
     code in fenced code blocks with language hints. \
     Output only the extracted content — no commentary or explanation.";

#[derive(serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ExtractFormat {
    Markdown,
    Csv,
    Json,
    Plain,
}

const CSV_PROMPT: &str =
    "Extract the data visible in this image as CSV. \
     Use the first row for column headers. Quote fields that contain commas. \
     If the image has no tabular data, emit a single `text` column with one row per line. \
     Output only the CSV — no commentary, no code fences.";

const JSON_PROMPT: &str =
    "Extract the data visible in this image as JSON. \
     Prefer an array of objects with descriptive keys for tabular data; \
     otherwise mirror the visible structure using objects and arrays. \
     Output only valid JSON — no commentary, no code fences.";

const PLAIN_PROMPT: &str =
    "Extract all text visible in this image as plain text. \
     Preserve reading order and line breaks. No markup, no commentary.";

pub fn prompt_for(format: ExtractFormat, hint: Option<&str>) -> String {
    let base = match format {
        ExtractFormat::Markdown => EXTRACTION_PROMPT,
        ExtractFormat::Csv => CSV_PROMPT,
        ExtractFormat::Json => JSON_PROMPT,
        ExtractFormat::Plain => PLAIN_PROMPT,
    };
    match hint.map(str::trim) {
        Some(h) if !h.is_empty() => format!("{base}\nAdditional instruction from the user: {h}"),
        _ => base.to_string(),
    }
}

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
    /// Download progress 0.0–1.0; `None` outside the downloading phase.
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
    fn api_url_builds_with_port() {
        assert_eq!(api_url(11500, "/health"), "http://127.0.0.1:11500/health");
    }

    #[test]
    fn health_deserializes_ready_ignoring_extra_fields() {
        let h: HealthStatus = serde_json::from_str(r#"{"status":"ready","progress":0.5}"#).unwrap();
        assert_eq!(h.status, ServerStatus::Ready);
    }

    #[test]
    fn health_deserializes_downloading() {
        let h: HealthStatus = serde_json::from_str(r#"{"status":"downloading"}"#).unwrap();
        assert_eq!(h.status, ServerStatus::Downloading);
    }

    #[test]
    fn health_reads_download_progress() {
        let h: HealthStatus =
            serde_json::from_str(r#"{"status":"downloading","progress":0.42}"#).unwrap();
        assert_eq!(h.status, ServerStatus::Downloading);
        assert_eq!(h.progress, Some(0.42));
    }

    #[test]
    fn health_progress_defaults_to_none_when_absent() {
        let h: HealthStatus = serde_json::from_str(r#"{"status":"loading"}"#).unwrap();
        assert_eq!(h.progress, None);
    }

    #[test]
    fn health_deserializes_error_status() {
        let h: HealthStatus = serde_json::from_str(r#"{"status":"error","progress":null}"#).unwrap();
        assert_eq!(h.status, ServerStatus::Error);
    }

    #[test]
    fn prompt_for_markdown_without_hint_is_the_default_prompt() {
        assert_eq!(prompt_for(ExtractFormat::Markdown, None), EXTRACTION_PROMPT);
    }

    #[test]
    fn prompt_for_each_format_names_its_output_shape() {
        assert!(prompt_for(ExtractFormat::Csv, None).contains("CSV"));
        assert!(prompt_for(ExtractFormat::Json, None).contains("JSON"));
        assert!(prompt_for(ExtractFormat::Plain, None).contains("plain text"));
    }

    #[test]
    fn prompt_for_appends_a_trimmed_hint() {
        let p = prompt_for(ExtractFormat::Csv, Some("  headers are dates "));
        assert!(p.ends_with("headers are dates"));
        assert!(p.contains("Additional instruction"));
    }

    #[test]
    fn prompt_for_ignores_blank_hints() {
        assert_eq!(
            prompt_for(ExtractFormat::Plain, Some("   ")),
            prompt_for(ExtractFormat::Plain, None)
        );
    }

    #[test]
    fn extract_format_deserializes_from_lowercase_json() {
        let f: ExtractFormat = serde_json::from_str("\"csv\"").unwrap();
        assert_eq!(f, ExtractFormat::Csv);
    }
}
