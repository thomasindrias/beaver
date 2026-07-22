//! Persisted user settings: default output format, capture shortcut,
//! history retention, and the update-check toggle. Stored as JSON in
//! `app_data_dir()`, following the same blocking-`std::fs` pattern
//! `server.rs` uses for its setup marker file.

use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::prompts::ExtractFormat;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub default_format: ExtractFormat,
    pub shortcut: String,
    pub history_retention_days: Option<u32>,
    pub update_check_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_format: ExtractFormat::Markdown,
            shortcut: crate::shortcut::CAPTURE_SHORTCUT.to_string(),
            history_retention_days: None,
            update_check_enabled: true,
        }
    }
}

/// Pure load: parses `path`, falling back to defaults if the file is
/// missing or fails to parse (logged, never fatal — a corrupt settings
/// file must not block startup).
fn load_from(path: &Path) -> Settings {
    match std::fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|e| {
            log::warn!("failed to parse settings file, using defaults: {e}");
            Settings::default()
        }),
        Err(_) => Settings::default(),
    }
}

/// Pure save: writes `settings` as pretty JSON to `path`, creating the
/// parent directory if needed.
fn save_to(path: &Path, settings: &Settings) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(settings).expect("Settings serialization cannot fail");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, json)
}

fn settings_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir must resolve")
        .join("settings.json")
}

pub fn load(app: &tauri::AppHandle) -> Settings {
    load_from(&settings_path(app))
}

pub fn save(app: &tauri::AppHandle, settings: &Settings) -> std::io::Result<()> {
    save_to(&settings_path(app), settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("beaver-settings-test-{name}.json"))
    }

    #[test]
    fn load_from_missing_file_returns_defaults() {
        let path = scratch_path("missing");
        let _ = std::fs::remove_file(&path);
        assert_eq!(load_from(&path), Settings::default());
    }

    #[test]
    fn load_from_corrupt_json_returns_defaults() {
        let path = scratch_path("corrupt");
        std::fs::write(&path, b"not valid json").unwrap();
        assert_eq!(load_from(&path), Settings::default());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn save_then_load_round_trips() {
        let path = scratch_path("roundtrip");
        let settings = Settings {
            default_format: crate::prompts::ExtractFormat::Json,
            shortcut: "CmdOrCtrl+Shift+X".to_string(),
            history_retention_days: Some(30),
            update_check_enabled: false,
        };
        save_to(&path, &settings).unwrap();
        assert_eq!(load_from(&path), settings);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn load_from_tolerates_fields_missing_from_an_older_file() {
        let path = scratch_path("forward-compat");
        std::fs::write(&path, br#"{"shortcut":"CmdOrCtrl+Shift+Z"}"#).unwrap();
        let settings = load_from(&path);
        assert_eq!(settings.shortcut, "CmdOrCtrl+Shift+Z");
        assert_eq!(settings.default_format, crate::prompts::ExtractFormat::Markdown);
        assert!(settings.update_check_enabled);
        assert_eq!(settings.history_retention_days, None);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn default_settings_use_the_hardcoded_capture_shortcut() {
        assert_eq!(Settings::default().shortcut, crate::shortcut::CAPTURE_SHORTCUT);
    }
}
