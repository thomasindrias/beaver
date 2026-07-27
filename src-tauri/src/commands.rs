//! Every `#[tauri::command]` the frontend can invoke. The frontend's typed
//! mirror of this surface is `src/lib/api.ts`.

use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::Manager;

use crate::{
    capture, engine, is_truthy, keychain, permission, prompts, server, settings, shortcut, update,
    windows,
};

/// The most recent capture's PNG bytes, kept so the HUD can re-extract with a
/// different format or hint without re-shooting the screen (which may have
/// changed, and which our own HUD could contaminate).
#[derive(Default)]
pub struct LastCapture(pub std::sync::Mutex<Option<Vec<u8>>>);

/// An extraction plus the engine that actually produced it. The frontend
/// cannot infer the engine from settings, because settings may change between
/// the capture and the render — the indicator must report what ran.
#[derive(serde::Serialize)]
pub struct ExtractionResult {
    pub text: String,
    pub engine: engine::EngineKind,
}

/// Resolve the engine for this capture.
///
/// The Keychain is only touched when cloud is actually selected: reading it on
/// every local capture is wasted work, and after a code-signature change it
/// would raise a system access prompt in the middle of the reflex.
///
/// A *missing* key is a normal state and falls back to local via `select`. A
/// genuine read failure is an error rather than a silent downgrade, because
/// quietly running on-device when the user asked for cloud would break the
/// determinism the design depends on.
fn resolve_engine(app: &tauri::AppHandle, port: u16) -> Result<engine::Engine, String> {
    let settings = settings::load(app);
    if settings.engine != engine::EngineKind::Cloud {
        return Ok(engine::Engine::Local { port });
    }
    let key = keychain::api_key().map_err(|e| {
        log::warn!("keychain read failed: {e}");
        format!(
            "{}Couldn't read the API key from the Keychain",
            engine::cloud::CLOUD_ERROR_PREFIX
        )
    })?;
    Ok(engine::select(&settings, key, port))
}

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
) -> Result<ExtractionResult, String> {
    if !permission::screen_capture_granted() {
        return Err(permission::PERMISSION_ERROR.to_string());
    }
    let port = state.port;
    let bytes = capture::capture_region(&region).map_err(|e| e.to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    *last.0.lock().unwrap() = Some(bytes);
    let default_format = settings::load(&app).default_format;
    let prompt = prompts::prompt_for(format.unwrap_or(default_format), None);
    let selected = resolve_engine(&app, port)?;
    let kind = selected.kind();
    let text = selected.extract(&image_base64, &prompt).await?;
    Ok(ExtractionResult { text, engine: kind })
}

#[tauri::command]
pub async fn re_extract(
    app: tauri::AppHandle,
    format: prompts::ExtractFormat,
    hint: Option<String>,
    state: tauri::State<'_, server::EngineState>,
    last: tauri::State<'_, LastCapture>,
) -> Result<ExtractionResult, String> {
    let bytes = last
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no-capture-cached".to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    let prompt = prompts::prompt_for(format, hint.as_deref());
    let selected = resolve_engine(&app, state.port)?;
    let kind = selected.kind();
    let text = selected.extract(&image_base64, &prompt).await?;
    Ok(ExtractionResult { text, engine: kind })
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

/// Whether a key is stored. Deliberately a boolean: the key itself is never
/// returned across the IPC boundary.
#[tauri::command]
pub fn has_cloud_api_key() -> bool {
    keychain::api_key().ok().flatten().is_some()
}

/// Deletes the stored key. Also resets a stored `engine: Cloud` back to Local,
/// because a cloud engine with no key cannot run and `settings.json` must not
/// claim an engine it cannot honor. Returns the settings as they now stand.
#[tauri::command]
pub fn delete_cloud_api_key(app: tauri::AppHandle) -> Result<settings::Settings, String> {
    keychain::delete_api_key()?;
    let current = settings::load(&app);
    match settings_after_key_removal(&current) {
        Some(next) => {
            settings::save(&app, &next).map_err(|e| e.to_string())?;
            Ok(next)
        }
        None => Ok(current),
    }
}

/// Removing the key makes a stored `engine: Cloud` unrunnable, so the engine is
/// reset to Local. Pure so the rule is unit-testable; returns `None` when
/// nothing needs saving.
fn settings_after_key_removal(current: &settings::Settings) -> Option<settings::Settings> {
    if current.engine != engine::EngineKind::Cloud {
        return None;
    }
    Some(settings::Settings {
        engine: engine::EngineKind::Local,
        ..current.clone()
    })
}

/// Refuse to persist a cloud engine that could not actually run. Pure so the
/// rule is unit-testable; `has_key` is supplied by the caller.
pub fn validate_cloud_settings(next: &settings::Settings, has_key: bool) -> Result<(), String> {
    if next.engine != engine::EngineKind::Cloud {
        return Ok(());
    }
    if next.cloud_base_url.trim().is_empty() {
        return Err("Cloud engine needs a base URL.".to_string());
    }
    if next.cloud_model.trim().is_empty() {
        return Err("Cloud engine needs a model.".to_string());
    }
    if !has_key {
        return Err("Cloud engine needs an API key. Save one first.".to_string());
    }
    Ok(())
}

/// Whether a save has enough to run cloud: a key supplied in this very call
/// counts, even before it has reached the Keychain, so first-time cloud setup
/// (settings and key committed together) is not rejected for "no key" merely
/// because the key isn't in the Keychain yet — this call is about to put it
/// there. Pure so the rule is unit-testable.
fn has_key_for_save(supplied: Option<&str>, already_stored: bool) -> bool {
    supplied.is_some_and(|k| !k.trim().is_empty()) || already_stored
}

/// Whether this save may proceed given how the provider is changing.
///
/// An API key belongs to exactly one provider. If the base URL is changing, the
/// stored key authenticates to the *previous* provider, so reusing it would
/// send the user's credential to a company that does not own it. Require the
/// new provider's key in the same action.
///
/// A change of model alone is fine: the key is still valid for that endpoint.
fn check_provider_change(
    current_base_url: &str,
    next_base_url: &str,
    supplies_key: bool,
    has_stored_key: bool,
) -> Result<(), String> {
    let changed = current_base_url.trim() != next_base_url.trim();
    if changed && has_stored_key && !supplies_key {
        return Err(
            "Changing the provider needs that provider's own API key. Enter it below and save again."
                .to_string(),
        );
    }
    Ok(())
}

/// Saves the cloud configuration, optionally along with a new API key, as one
/// action.
///
/// The key and the endpoint it authenticates to are one logical identity.
/// Committing them separately lets a provider switch leave a key paired with
/// the previous provider's URL, which sends the user's credential to a
/// company that does not own it.
///
/// Settings are written first and rolled back if the key write then fails, so
/// every failure path leaves the previous pairing intact. The reverse order
/// could not recover: the old key is never read back, so it cannot be
/// restored.
#[tauri::command]
pub fn save_cloud_config(
    app: tauri::AppHandle,
    next: settings::Settings,
    api_key: Option<String>,
) -> Result<settings::Settings, String> {
    let stored_key = has_cloud_api_key();
    let supplies_key = api_key.as_deref().is_some_and(|k| !k.trim().is_empty());
    validate_cloud_settings(&next, has_key_for_save(api_key.as_deref(), stored_key))?;

    let current = settings::load(&app);
    check_provider_change(
        &current.cloud_base_url,
        &next.cloud_base_url,
        supplies_key,
        stored_key,
    )?;
    settings::save(&app, &next).map_err(|e| e.to_string())?;

    if let Some(key) = api_key.filter(|k| !k.trim().is_empty()) {
        if let Err(e) = keychain::set_api_key(&key) {
            if let Err(rollback) = settings::save(&app, &current) {
                log::error!("failed to roll back settings after a key write failure: {rollback}");
            }
            return Err(e);
        }
    }
    Ok(next)
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
    validate_cloud_settings(&next, has_cloud_api_key())?;
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

    use crate::engine::EngineKind;
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
    fn validate_accepts_a_complete_cloud_configuration() {
        assert!(validate_cloud_settings(&cloud_settings(), true).is_ok());
    }

    #[test]
    fn validate_ignores_cloud_fields_when_the_engine_is_local() {
        let s = Settings { engine: EngineKind::Local, ..Settings::default() };
        assert!(validate_cloud_settings(&s, false).is_ok());
    }

    #[test]
    fn validate_rejects_cloud_without_a_key() {
        let err = validate_cloud_settings(&cloud_settings(), false).unwrap_err();
        assert!(err.contains("API key"), "unexpected message: {err}");
    }

    #[test]
    fn validate_rejects_a_blank_base_url() {
        let s = Settings { cloud_base_url: "  ".to_string(), ..cloud_settings() };
        let err = validate_cloud_settings(&s, true).unwrap_err();
        assert!(err.contains("base URL"), "unexpected message: {err}");
    }

    #[test]
    fn validate_rejects_a_blank_model() {
        let s = Settings { cloud_model: String::new(), ..cloud_settings() };
        let err = validate_cloud_settings(&s, true).unwrap_err();
        assert!(err.contains("model"), "unexpected message: {err}");
    }

    #[test]
    fn removing_the_key_resets_a_cloud_engine_to_local() {
        let next = settings_after_key_removal(&cloud_settings()).expect("a save is needed");
        assert_eq!(next.engine, EngineKind::Local);
    }

    #[test]
    fn removing_the_key_preserves_the_rest_of_the_configuration() {
        // The URL and model are kept so re-adding a key restores the setup
        // without retyping it.
        let next = settings_after_key_removal(&cloud_settings()).expect("a save is needed");
        assert_eq!(next.cloud_base_url, "https://api.openai.com/v1");
        assert_eq!(next.cloud_model, "gpt-4o-mini");
        assert_eq!(next.shortcut, Settings::default().shortcut);
    }

    #[test]
    fn removing_the_key_needs_no_save_when_the_engine_is_already_local() {
        let s = Settings { engine: EngineKind::Local, ..Settings::default() };
        assert!(settings_after_key_removal(&s).is_none());
    }

    // `has_key_for_save` backs `save_cloud_config`'s validation: a key
    // supplied in the same call must count even before it reaches the
    // Keychain, or first-time cloud setup (settings and key committed
    // together) would be rejected for "no key" when the key is sitting
    // right there in the request.
    #[test]
    fn has_key_for_save_counts_a_key_supplied_in_this_call() {
        assert!(has_key_for_save(Some("sk-abc"), false));
    }

    #[test]
    fn has_key_for_save_counts_an_already_stored_key_when_none_is_supplied() {
        assert!(has_key_for_save(None, true));
    }

    #[test]
    fn has_key_for_save_rejects_a_blank_supplied_key_with_none_already_stored() {
        assert!(!has_key_for_save(Some("   "), false));
    }

    #[test]
    fn has_key_for_save_rejects_when_neither_supplied_nor_stored() {
        assert!(!has_key_for_save(None, false));
    }

    #[test]
    fn changing_the_provider_without_a_new_key_is_rejected() {
        let err = check_provider_change(
            "https://api.openai.com/v1",
            "https://api.anthropic.com/v1",
            false,
            true,
        )
        .unwrap_err();
        assert!(err.contains("own API key"), "unexpected message: {err}");
    }

    #[test]
    fn changing_the_provider_with_a_new_key_is_allowed() {
        assert!(check_provider_change(
            "https://api.openai.com/v1",
            "https://api.anthropic.com/v1",
            true,
            true,
        )
        .is_ok());
    }

    #[test]
    fn keeping_the_same_provider_needs_no_new_key() {
        assert!(check_provider_change(
            "https://api.openai.com/v1",
            "https://api.openai.com/v1",
            false,
            true,
        )
        .is_ok());
    }

    #[test]
    fn changing_only_the_model_needs_no_new_key() {
        // Same endpoint, so the stored key is still the right credential.
        assert!(check_provider_change(
            "https://api.openai.com/v1",
            "https://api.openai.com/v1",
            false,
            true,
        )
        .is_ok());
    }

    #[test]
    fn first_time_setup_is_not_blocked_by_the_provider_rule() {
        // No stored key yet, so there is no credential to mispair.
        assert!(check_provider_change("", "https://api.openai.com/v1", true, false).is_ok());
    }

    #[test]
    fn whitespace_differences_alone_are_not_a_provider_change() {
        assert!(check_provider_change(
            "https://api.openai.com/v1",
            "  https://api.openai.com/v1  ",
            false,
            true,
        )
        .is_ok());
    }
}
