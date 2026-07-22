//! Every `#[tauri::command]` the frontend can invoke. The frontend's typed
//! mirror of this surface is `src/lib/api.ts`.

use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::Manager;

use crate::{capture, engine, is_truthy, permission, prompts, server, settings, shortcut, update, windows};

/// The most recent capture's PNG bytes, kept so the HUD can re-extract with a
/// different format or hint without re-shooting the screen (which may have
/// changed, and which our own HUD could contaminate).
#[derive(Default)]
pub struct LastCapture(pub std::sync::Mutex<Option<Vec<u8>>>);

// Capture and extract in one hop: the (multi-MB) image bytes stay in Rust and
// are base64-encoded once for the engine server, instead of round-tripping to
// the frontend and back across the IPC boundary as a giant string.
#[tauri::command]
pub async fn capture_and_extract(
    app: tauri::AppHandle,
    region: capture::CaptureRegion,
    format: Option<prompts::ExtractFormat>,
    state: tauri::State<'_, server::EngineState>,
    last: tauri::State<'_, LastCapture>,
) -> Result<String, String> {
    if !permission::screen_capture_granted() {
        return Err(permission::PERMISSION_ERROR.to_string());
    }
    let port = state.port;
    let bytes = capture::capture_region(&region).map_err(|e| e.to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    *last.0.lock().unwrap() = Some(bytes);
    let default_format = settings::load(&app).default_format;
    let prompt = prompts::prompt_for(format.unwrap_or(default_format), None);
    engine::local::extract_from_image(port, &image_base64, &prompt).await
}

#[tauri::command]
pub async fn re_extract(
    format: prompts::ExtractFormat,
    hint: Option<String>,
    state: tauri::State<'_, server::EngineState>,
    last: tauri::State<'_, LastCapture>,
) -> Result<String, String> {
    let bytes = last
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no-capture-cached".to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    let prompt = prompts::prompt_for(format, hint.as_deref());
    engine::local::extract_from_image(state.port, &image_base64, &prompt).await
}

#[derive(serde::Serialize)]
pub struct EngineStatusReport {
    phase: String,
    /// Download progress 0.0–1.0 during the downloading phase; `None` otherwise.
    progress: Option<f64>,
    /// User-readable failure reason when phase == "error"; `None` otherwise.
    detail: Option<String>,
}

#[tauri::command]
pub async fn engine_status(
    state: tauri::State<'_, server::EngineState>,
) -> Result<EngineStatusReport, ()> {
    // Copy the cheap bits out before any await so we never hold the lock across it.
    let phase = *state.phase.lock().unwrap();
    let detail = state.failure.lock().unwrap().clone();
    let port = state.port;

    let (label, progress) = match phase {
        server::SetupPhase::BuildingEnv => {
            ("preparing".to_string(), *state.download_progress.lock().unwrap())
        }
        server::SetupPhase::Failed => ("error".to_string(), None),
        server::SetupPhase::StartingServer | server::SetupPhase::ServerUp => {
            match engine::local::health(port).await {
                Ok(h) => {
                    let label = match h.status {
                        engine::ServerStatus::Downloading => "downloading",
                        engine::ServerStatus::Loading => "loading",
                        engine::ServerStatus::Ready => "ready",
                        engine::ServerStatus::Error => "error",
                    }
                    .to_string();
                    (label, h.progress)
                }
                Err(_) => ("starting".to_string(), None),
            }
        }
    };
    Ok(EngineStatusReport {
        phase: label.clone(),
        progress,
        detail: if label == "error" { detail } else { None },
    })
}

#[tauri::command]
pub async fn write_to_clipboard(app: tauri::AppHandle, text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

// End onboarding once setup is ready: surface the menu-bar popover so the user
// discovers where Beaver lives, then close the onboarding window. The
// setup-complete marker is written by the setup readiness poll (`spawn_setup`),
// not here — this command only runs once the UI has already observed "ready",
// so writing it again here would be redundant and, on a retry raced against a
// still-failed setup, would wrongly mark an incomplete setup as done.
#[tauri::command]
pub fn finish_onboarding(app: tauri::AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = handle.get_webview_window("onboarding") {
            let _ = w.close();
        }
        windows::open_popover_at_menubar(&handle);
    });
}

#[tauri::command]
pub fn retry_setup(app: tauri::AppHandle) {
    server::spawn_setup(app);
}

#[tauri::command]
pub fn screen_permission_granted() -> bool {
    permission::screen_capture_granted()
}

#[tauri::command]
pub fn request_screen_permission() -> bool {
    permission::request_screen_capture()
}

#[tauri::command]
pub fn open_screen_recording_settings() {
    if let Err(e) = std::process::Command::new("open")
        .arg(permission::SETTINGS_URL)
        .spawn()
    {
        log::error!("failed to open System Settings: {e}");
    }
}

#[tauri::command]
pub fn relaunch_app(app: tauri::AppHandle) {
    server::mark_permission_relaunch(&app);
    app.restart();
}

#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Option<update::UpdateInfo> {
    if is_truthy(std::env::var("BEAVER_DISABLE_UPDATE_CHECK").ok()) {
        return None;
    }
    if !settings::load(&app).update_check_enabled {
        return None;
    }
    let current = app.package_info().version.to_string();
    let cache_path = server::update_cache_path(&app);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs();

    let cached: Option<update::CheckCache> = std::fs::read_to_string(&cache_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());

    let cache = match &cached {
        Some(c) if update::cache_is_fresh(c.checked_at, now) => c.clone(),
        _ => {
            let fetched = update::fetch_latest().await;
            // A failed fetch (`None`) keeps whatever was previously cached —
            // see `merge_cache` — so one transient network blip doesn't hide
            // an already-known newer version for up to 24h. Either way the
            // cache is rewritten so an offline machine retries at most once
            // per interval instead of on every call.
            let c = update::merge_cache(cached.as_ref(), now, fetched);
            if let Ok(json) = serde_json::to_string(&c) {
                let _ = std::fs::write(&cache_path, json);
            }
            c
        }
    };

    if update::is_newer(&current, &cache.latest_tag) {
        Some(update::UpdateInfo {
            version: cache.latest_tag.trim_start_matches('v').to_string(),
            url: cache.url,
        })
    } else {
        None
    }
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !update::allowed_external_url(&url) {
        return Err("blocked url".to_string());
    }
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> settings::Settings {
    settings::load(&app)
}

// Saves before touching the live shortcut registration, and rolls the save
// back if the registration then fails. Either order has a failure window;
// this one fails closed on the cheap, rarely-failing operation (a local
// file write) so the only real risk (an OS-level shortcut conflict) is
// caught with the disk write already rolled back — persisted state and the
// live registration can never disagree, whichever step fails.
#[tauri::command]
pub fn update_settings(
    app: tauri::AppHandle,
    next: settings::Settings,
) -> Result<settings::Settings, String> {
    let current = settings::load(&app);
    settings::save(&app, &next).map_err(|e| e.to_string())?;
    if next.shortcut != current.shortcut {
        if let Err(e) = shortcut::apply(&app, &next.shortcut, Some(&current.shortcut)) {
            if let Err(rollback_err) = settings::save(&app, &current) {
                log::error!("failed to roll back settings after shortcut apply failure: {rollback_err}");
            }
            return Err(e);
        }
    }
    Ok(next)
}

#[tauri::command]
pub fn open_settings(app: tauri::AppHandle) {
    windows::show_settings(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn last_capture_starts_empty_and_roundtrips_bytes() {
        let last = LastCapture::default();
        assert!(last.0.lock().unwrap().is_none());
        *last.0.lock().unwrap() = Some(vec![1, 2, 3]);
        assert_eq!(last.0.lock().unwrap().clone().unwrap(), vec![1, 2, 3]);
    }
}
