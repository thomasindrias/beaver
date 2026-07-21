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
}
