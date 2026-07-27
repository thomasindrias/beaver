//! Vision-engine backends.
//!
//! Every backend exposes the same surface against the shared types below:
//! provisioning (`env_is_ready`, `build_env`), process control
//! (`spawn_server`), and an HTTP client (`health`, `extract_from_image`).
//!
//! The *local* backend is a per-target compile-time choice — MLX requires
//! Apple Silicon's unified memory, and the bundled llama.cpp binaries are
//! x86_64 — surfaced as the single `local` alias so the rest of the app
//! never names a concrete backend. An engine that isn't hardware-bound
//! (e.g. a BYO-cloud provider) would be a new sibling module chosen at
//! runtime instead of here.

#[cfg(target_arch = "x86_64")]
pub mod llamacpp;
#[cfg(target_arch = "aarch64")]
pub mod mlx;

#[cfg(target_arch = "x86_64")]
pub use llamacpp as local;
#[cfg(target_arch = "aarch64")]
pub use mlx as local;

pub mod cloud;

use crate::settings::Settings;

/// Which engine ran, or should run. Serialized lowercase to match
/// `ExtractFormat`'s convention on the IPC boundary.
#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum EngineKind {
    Local,
    Cloud,
}

/// A resolved engine, ready to run one extraction.
///
/// Only `extract` varies between the variants. Provisioning, process spawning,
/// and health polling are local-only concerns and stay in `local`, still
/// selected at compile time by target architecture.
pub enum Engine {
    Local { port: u16 },
    Cloud(cloud::Config),
}

impl Engine {
    pub fn kind(&self) -> EngineKind {
        match self {
            Engine::Local { .. } => EngineKind::Local,
            Engine::Cloud(_) => EngineKind::Cloud,
        }
    }

    pub async fn extract(&self, image_base64: &str, prompt: &str) -> Result<String, String> {
        match self {
            Engine::Local { port } => local::extract_from_image(*port, image_base64, prompt).await,
            Engine::Cloud(cfg) => cloud::extract_from_image(cfg, image_base64, prompt).await,
        }
    }
}

/// Decide which engine runs this capture.
///
/// This is the branch that determines whether a capture leaves the machine, so
/// it is a pure function with no I/O: the caller reads the settings and the
/// keychain, and this decides. Cloud requires *every* piece to be present —
/// the setting, a base URL, a model, and a key — and falls back to local
/// otherwise. `update_settings` refuses to persist an incomplete cloud
/// configuration, so that fallback is a safety net rather than a path users
/// reach.
pub fn select(settings: &Settings, key: Option<String>, port: u16) -> Engine {
    if settings.engine != EngineKind::Cloud {
        return Engine::Local { port };
    }
    let base_url = settings.cloud_base_url.trim();
    let model = settings.cloud_model.trim();
    let key = key.unwrap_or_default();
    if base_url.is_empty() || model.is_empty() || key.trim().is_empty() {
        return Engine::Local { port };
    }
    Engine::Cloud(cloud::Config {
        base_url: base_url.to_string(),
        model: model.to_string(),
        api_key: key,
    })
}

/// Lifecycle states reported by an engine server's health check.
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

pub fn api_url(port: u16, path: &str) -> String {
    format!("http://127.0.0.1:{port}{path}")
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

    use crate::settings::Settings;

    fn cloud_settings() -> Settings {
        Settings {
            engine: EngineKind::Cloud,
            cloud_base_url: "https://api.openai.com/v1".to_string(),
            cloud_model: "gpt-4o-mini".to_string(),
            ..Settings::default()
        }
    }

    #[test]
    fn engine_kind_defaults_to_local() {
        assert_eq!(Settings::default().engine, EngineKind::Local);
    }

    #[test]
    fn engine_kind_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&EngineKind::Cloud).unwrap(), "\"cloud\"");
        assert_eq!(serde_json::to_string(&EngineKind::Local).unwrap(), "\"local\"");
    }

    #[test]
    fn select_returns_cloud_when_fully_configured() {
        let e = select(&cloud_settings(), Some("sk-abc".to_string()), 11500);
        assert_eq!(e.kind(), EngineKind::Cloud);
    }

    #[test]
    fn select_passes_the_configuration_through_to_cloud() {
        let e = select(&cloud_settings(), Some("sk-abc".to_string()), 11500);
        match e {
            Engine::Cloud(cfg) => {
                assert_eq!(cfg.base_url, "https://api.openai.com/v1");
                assert_eq!(cfg.model, "gpt-4o-mini");
                assert_eq!(cfg.api_key, "sk-abc");
            }
            Engine::Local { .. } => panic!("expected the cloud engine"),
        }
    }

    #[test]
    fn select_returns_local_when_the_setting_is_local() {
        // Even with a complete cloud configuration present, the setting wins.
        let s = Settings { engine: EngineKind::Local, ..cloud_settings() };
        assert_eq!(select(&s, Some("sk-abc".to_string()), 11500).kind(), EngineKind::Local);
    }

    #[test]
    fn select_falls_back_to_local_without_a_key() {
        assert_eq!(select(&cloud_settings(), None, 11500).kind(), EngineKind::Local);
    }

    #[test]
    fn select_falls_back_to_local_on_a_blank_key() {
        let e = select(&cloud_settings(), Some("   ".to_string()), 11500);
        assert_eq!(e.kind(), EngineKind::Local);
    }

    #[test]
    fn select_falls_back_to_local_on_a_blank_base_url() {
        let s = Settings { cloud_base_url: "  ".to_string(), ..cloud_settings() };
        assert_eq!(select(&s, Some("sk-abc".to_string()), 11500).kind(), EngineKind::Local);
    }

    #[test]
    fn select_falls_back_to_local_on_a_blank_model() {
        let s = Settings { cloud_model: String::new(), ..cloud_settings() };
        assert_eq!(select(&s, Some("sk-abc".to_string()), 11500).kind(), EngineKind::Local);
    }

    #[test]
    fn select_carries_the_port_into_the_local_engine() {
        match select(&Settings::default(), None, 12345) {
            Engine::Local { port } => assert_eq!(port, 12345),
            Engine::Cloud(_) => panic!("expected the local engine"),
        }
    }

    #[test]
    fn select_trims_whitespace_from_the_cloud_configuration() {
        let s = Settings {
            cloud_base_url: "  https://api.openai.com/v1  ".to_string(),
            cloud_model: "  gpt-4o-mini  ".to_string(),
            ..cloud_settings()
        };
        match select(&s, Some("sk-abc".to_string()), 11500) {
            Engine::Cloud(cfg) => {
                assert_eq!(cfg.base_url, "https://api.openai.com/v1");
                assert_eq!(cfg.model, "gpt-4o-mini");
            }
            Engine::Local { .. } => panic!("expected the cloud engine"),
        }
    }
}
