pub const OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434";
pub const MODEL_NAME: &str = "qwen2.5-vl:3b";

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
mod tests {
    use super::*;

    #[test]
    fn api_url_builds_correctly() {
        assert_eq!(api_url("/api/tags"), "http://127.0.0.1:11434/api/tags");
    }

    #[test]
    fn model_name_is_correct() {
        assert_eq!(MODEL_NAME, "qwen2.5-vl:3b");
    }

    #[test]
    fn base_url_uses_localhost_port() {
        assert!(OLLAMA_BASE_URL.contains("127.0.0.1:11434"));
    }
}
