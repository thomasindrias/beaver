mod capture;
mod db;
mod mlx;
mod permission;
mod server;
mod shortcut;
mod update;

use base64::{engine::general_purpose::STANDARD, Engine};
use std::sync::Mutex;
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

// Tracks when the popover was last auto-hidden on focus loss, so a tray-icon
// click that triggered that blur doesn't immediately re-open the window.
struct PopoverHideTime(Mutex<Option<std::time::Instant>>);

#[cfg(target_os = "macos")]
fn apply_popover_vibrancy(window: &tauri::WebviewWindow) {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
    if let Err(e) = apply_vibrancy(
        window,
        NSVisualEffectMaterial::HudWindow,
        Some(NSVisualEffectState::Active),
        Some(18.0),
    ) {
        log::warn!("failed to apply vibrancy: {e}");
    }
}

fn is_truthy(val: Option<String>) -> bool {
    !matches!(val.as_deref().map(str::trim), None | Some("") | Some("0") | Some("false") | Some("no"))
}

// Dev/test override: when `BEAVER_FORCE_ONBOARDING` is set to a truthy value,
// show onboarding on every launch regardless of the setup-complete marker, so
// the flow can be re-tested without wiping app data. The model-download phase
// skips a cached model (see `_resolve_model` in mlx_server.py), so re-running is
// cheap.
fn force_onboarding_enabled() -> bool {
    is_truthy(std::env::var("BEAVER_FORCE_ONBOARDING").ok())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("beaver".into()),
                    }),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:beaver.db", db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            log::info!(
                "Beaver v{} starting; logs in {:?}",
                app.package_info().version,
                app.path().app_log_dir().ok()
            );

            #[cfg(target_os = "macos")]
            let _ = app.handle().set_activation_policy(tauri::ActivationPolicy::Accessory);

            app.manage(PopoverHideTime(Mutex::new(None)));

            // Right-click tray menu. Beaver stays alive when its windows close
            // (see the ExitRequested guard in `run`), so this Quit item is the
            // only way out. A custom item firing `app.exit(0)` is used instead of
            // the predefined Quit, whose OS-level terminate would be swallowed by
            // that same guard.
            let tray_menu = MenuBuilder::new(app).text("quit", "Quit Beaver").build()?;

            let _tray = TrayIconBuilder::new()
                // Dedicated menu-bar glyph generated from the same beaver head
                // mark used by the React Logo and browser favicon. Colored, so
                // it's not rendered as a monochrome template.
                .icon(tauri::include_image!("icons/tray.png"))
                .icon_as_template(false)
                .tooltip("Beaver")
                .menu(&tray_menu)
                // Keep left-click for toggling the popover; the menu opens on
                // right-click only.
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Click fires for both press and release — only act on the
                    // left-button release so the popover toggles once per click.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        toggle_popover(app, Some(rect));
                    }
                })
                .build(app)?;

            let sc: Shortcut = shortcut::CAPTURE_SHORTCUT.parse().expect("invalid shortcut");
            app.global_shortcut().on_shortcut(sc, |app, _sc, event| {
                if event.state == ShortcutState::Pressed {
                    show_capture_overlay(app);
                }
            })?;

            // Pick a free localhost port and register server state up front so
            // commands can read it immediately.
            let port = server::free_port().unwrap_or(11500);
            app.manage(server::MlxServer::new(port));

            // Show onboarding immediately when the model isn't cached yet, so the
            // user watches setup progress instead of a blank app. Created here
            // (on the main thread, since `.setup` already runs there) rather than
            // inside the setup worker, so onboarding shows up exactly once per
            // launch regardless of how many times setup itself is retried.
            let first_launch = !server::setup_is_complete(app.handle()) || force_onboarding_enabled();
            if first_launch {
                let h = app.handle().clone();
                let mut builder = tauri::WebviewWindowBuilder::new(
                    &h,
                    "onboarding",
                    tauri::WebviewUrl::App("/".into()),
                )
                .title("Welcome to Beaver")
                .inner_size(480.0, 640.0)
                .center();
                // Borderless chrome: let the dark UI fill to the top edge with the
                // traffic lights floating over it, instead of a white system title
                // bar.
                #[cfg(target_os = "macos")]
                {
                    builder = builder
                        .hidden_title(true)
                        .title_bar_style(tauri::TitleBarStyle::Overlay);
                }
                if let Err(e) = builder.build() {
                    log::error!("failed to create onboarding window: {e}");
                }
            }

            // Build the venv (first run only), spawn the server, and poll it to
            // readiness — all off the main thread so the tray is usable at once.
            spawn_setup(app.handle().clone());

            // After the permission relaunch, surface the popover once so the
            // user lands somewhere instead of a silent menu-bar app.
            if server::take_permission_relaunch(app.handle()) {
                open_popover_at_menubar(app.handle());
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_and_extract,
            mlx_status,
            write_to_clipboard,
            finish_onboarding,
            retry_setup,
            screen_permission_granted,
            request_screen_permission,
            open_screen_recording_settings,
            relaunch_app,
            check_for_update,
            open_external
        ])
        .build(tauri::generate_context!())
        .expect("error while building Beaver")
        .run(|app, event| match event {
            // Beaver lives in the menu bar (Accessory activation policy) with no
            // persistent window. Closing the last window — e.g. the capture
            // overlay dismissing itself after a capture — must NOT quit the app.
            // `code: None` marks a window-close/user-initiated exit; a
            // programmatic `app.exit(code)` carries a code and is left to proceed
            // so the app stays quittable.
            tauri::RunEvent::ExitRequested { code: None, api, .. } => {
                api.prevent_exit();
            }
            tauri::RunEvent::Exit => {
                if let Some(state) = app.try_state::<server::MlxServer>() {
                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
            _ => {}
        });
}

/// Build the env (first run), spawn the MLX server, and poll it to readiness —
/// all off the main thread. Re-runnable: `retry_setup` calls this again after a
/// failure. The `setup_running` flag makes concurrent calls a no-op.
fn spawn_setup(handle: tauri::AppHandle) {
    {
        let state = handle.state::<server::MlxServer>();
        if state
            .setup_running
            .swap(true, std::sync::atomic::Ordering::SeqCst)
        {
            return; // a setup pass is already in flight
        }
        *state.failure.lock().unwrap() = None;
        *state.phase.lock().unwrap() = server::SetupPhase::BuildingEnv;
        // A retry after a spawn-then-crash leaves a stale child; reap it.
        if let Ok(mut guard) = state.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        };
    }

    std::thread::spawn(move || {
        // Clear the running flag on every exit path, including panics —
        // otherwise a single panicked setup pass would permanently disable
        // retry_setup for the rest of the process's life.
        struct ClearRunningOnExit(tauri::AppHandle);
        impl Drop for ClearRunningOnExit {
            fn drop(&mut self) {
                let state = self.0.state::<server::MlxServer>();
                state
                    .setup_running
                    .store(false, std::sync::atomic::Ordering::SeqCst);
            }
        }
        let _clear_running = ClearRunningOnExit(handle.clone());

        let state = handle.state::<server::MlxServer>();

        if !server::env_is_ready(&handle) {
            if let Err(msg) = server::preflight_disk(&handle) {
                state.fail(msg);
                return;
            }
            if let Err(e) = server::build_env(&handle) {
                state.fail(format!(
                    "Couldn't prepare the on-device Python environment. Check your \
                     internet connection and try again. ({e})"
                ));
                return;
            }
        }

        *state.phase.lock().unwrap() = server::SetupPhase::StartingServer;
        match server::spawn_server(&handle, state.port) {
            Ok(child) => {
                *state.child.lock().unwrap() = Some(child);
            }
            Err(e) => {
                state.fail(format!("Couldn't start the on-device model server. ({e})"));
                return;
            }
        }

        // Poll to readiness (same policy as before: no wall-clock deadline while
        // reachable; fail on sustained unreachability, with an absolute cap).
        let started = std::time::Instant::now();
        let mut last_reachable = std::time::Instant::now();
        let unreachable_grace = std::time::Duration::from_secs(60);
        let absolute_cap = std::time::Duration::from_secs(3600);
        loop {
            match tauri::async_runtime::block_on(mlx::health(state.port)) {
                Ok(h) => {
                    last_reachable = std::time::Instant::now();
                    match h.status {
                        mlx::ServerStatus::Ready => {
                            *state.phase.lock().unwrap() = server::SetupPhase::ServerUp;
                            server::mark_setup_complete(&handle);
                            break;
                        }
                        mlx::ServerStatus::Error => {
                            state.fail(
                                "The on-device model failed to load. Try again — the \
                                 log file has details."
                                    .to_string(),
                            );
                            break;
                        }
                        _ => {} // downloading / loading — keep waiting
                    }
                }
                Err(_) => {
                    if last_reachable.elapsed() > unreachable_grace {
                        state.fail(
                            "Lost contact with the on-device model server. Check your \
                             internet connection and try again."
                                .to_string(),
                        );
                        break;
                    }
                }
            }
            if started.elapsed() > absolute_cap {
                state.fail("Setup took too long and was stopped. Try again.".to_string());
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}

#[tauri::command]
fn retry_setup(app: tauri::AppHandle) {
    spawn_setup(app);
}

#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> Option<update::UpdateInfo> {
    if is_truthy(std::env::var("BEAVER_DISABLE_UPDATE_CHECK").ok()) {
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

    let cache = match cached {
        Some(c) if update::cache_is_fresh(c.checked_at, now) => c,
        _ => {
            let (latest_tag, url) = update::fetch_latest().await.unwrap_or_default();
            // Cache even a failed attempt (empty tag) so an offline machine
            // retries at most once per interval instead of on every call.
            let c = update::CheckCache { checked_at: now, latest_tag, url };
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
fn open_external(url: String) -> Result<(), String> {
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
fn screen_permission_granted() -> bool {
    permission::screen_capture_granted()
}

#[tauri::command]
fn request_screen_permission() -> bool {
    permission::request_screen_capture()
}

#[tauri::command]
fn open_screen_recording_settings() {
    if let Err(e) = std::process::Command::new("open")
        .arg(permission::SETTINGS_URL)
        .spawn()
    {
        log::error!("failed to open System Settings: {e}");
    }
}

#[tauri::command]
fn relaunch_app(app: tauri::AppHandle) {
    server::mark_permission_relaunch(&app);
    app.restart();
}

#[derive(serde::Serialize)]
struct MlxStatus {
    phase: String,
    /// Download progress 0.0–1.0 during the downloading phase; `None` otherwise.
    progress: Option<f64>,
    /// User-readable failure reason when phase == "error"; `None` otherwise.
    detail: Option<String>,
}

#[tauri::command]
async fn mlx_status(state: tauri::State<'_, server::MlxServer>) -> Result<MlxStatus, ()> {
    // Copy the cheap bits out before any await so we never hold the lock across it.
    let phase = *state.phase.lock().unwrap();
    let detail = state.failure.lock().unwrap().clone();
    let port = state.port;

    let (label, progress) = match phase {
        server::SetupPhase::BuildingEnv => ("preparing".to_string(), None),
        server::SetupPhase::Failed => ("error".to_string(), None),
        server::SetupPhase::StartingServer | server::SetupPhase::ServerUp => {
            match mlx::health(port).await {
                Ok(h) => {
                    let label = match h.status {
                        mlx::ServerStatus::Downloading => "downloading",
                        mlx::ServerStatus::Loading => "loading",
                        mlx::ServerStatus::Ready => "ready",
                        mlx::ServerStatus::Error => "error",
                    }
                    .to_string();
                    (label, h.progress)
                }
                Err(_) => ("starting".to_string(), None),
            }
        }
    };
    Ok(MlxStatus {
        phase: label.clone(),
        progress,
        detail: if label == "error" { detail } else { None },
    })
}

// Capture and extract in one hop: the (multi-MB) image bytes stay in Rust and
// are base64-encoded once for the MLX server, instead of round-tripping to the
// frontend and back across the IPC boundary as a giant string.
#[tauri::command]
async fn capture_and_extract(
    region: capture::CaptureRegion,
    state: tauri::State<'_, server::MlxServer>,
) -> Result<String, String> {
    if !permission::screen_capture_granted() {
        return Err(permission::PERMISSION_ERROR.to_string());
    }
    let port = state.port;
    let bytes = capture::capture_region(&region).map_err(|e| e.to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    mlx::extract_from_image(port, &image_base64).await
}

#[tauri::command]
async fn write_to_clipboard(app: tauri::AppHandle, text: String) -> Result<(), String> {
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
fn finish_onboarding(app: tauri::AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = handle.get_webview_window("onboarding") {
            let _ = w.close();
        }
        open_popover_at_menubar(&handle);
    });
}

const POPOVER_W: f64 = 320.0;
const POPOVER_H: f64 = 520.0;

// Logical top-left for the popover: horizontally centered under the tray icon,
// just below the menu bar, clamped to the icon's own monitor so it never spills
// off-screen near a display edge.
fn popover_position(app: &tauri::AppHandle, icon_rect: tauri::Rect) -> tauri::LogicalPosition<f64> {
    // The tray rect is in physical pixels; pull out the icon's physical bounds.
    let pos = icon_rect.position.to_physical::<f64>(1.0);
    let size = icon_rect.size.to_physical::<f64>(1.0);
    let icon_center_x = pos.x + size.width / 2.0;
    let icon_center_y = pos.y + size.height / 2.0;

    let monitor = app
        .monitor_from_point(icon_center_x, icon_center_y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());

    let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(2.0);

    let gap = 4.0;
    let mut win_x = icon_center_x / scale - POPOVER_W / 2.0;
    let win_y = (pos.y + size.height) / scale + gap;

    if let Some(m) = monitor {
        let margin = 8.0;
        let mon_left = m.position().x as f64 / scale;
        let mon_right = (m.position().x as f64 + m.size().width as f64) / scale;
        let max_x = (mon_right - POPOVER_W - margin).max(mon_left + margin);
        win_x = win_x.clamp(mon_left + margin, max_x);
    } else {
        win_x = win_x.max(0.0);
    }

    tauri::LogicalPosition::new(win_x, win_y)
}

// Fallback popover anchor when there's no tray-click rect (e.g. opened
// programmatically at the end of onboarding). macOS keeps menu-bar items at the
// top-right, so tucking the popover under the top-right corner of the primary
// monitor points the user at the Beaver tray icon.
fn popover_position_menubar(app: &tauri::AppHandle) -> tauri::LogicalPosition<f64> {
    let margin = 8.0;
    let below_menubar = 32.0;
    if let Some(m) = app.primary_monitor().ok().flatten() {
        let scale = m.scale_factor();
        let mon_left = m.position().x as f64 / scale;
        let mon_right = (m.position().x as f64 + m.size().width as f64) / scale;
        let x = (mon_right - POPOVER_W - margin).max(mon_left + margin);
        tauri::LogicalPosition::new(x, below_menubar)
    } else {
        tauri::LogicalPosition::new(margin, below_menubar)
    }
}

fn toggle_popover(app: &tauri::AppHandle, icon_rect: Option<tauri::Rect>) {
    if let Some(w) = app.get_webview_window("popover") {
        if w.is_visible().unwrap_or(false) {
            if let Err(e) = w.hide() { log::error!("failed to hide popover: {e}"); }
        } else {
            // If the window was just auto-hidden on focus loss (because this
            // very tray click stole focus), treat the click as a dismiss and
            // don't re-open it.
            let just_hidden = app
                .state::<PopoverHideTime>()
                .0
                .lock()
                .ok()
                .and_then(|g| *g)
                .is_some_and(|t| t.elapsed() < std::time::Duration::from_millis(300));
            if just_hidden {
                return;
            }
            if let Some(rect) = icon_rect {
                if let Err(e) = w.set_position(popover_position(app, rect)) {
                    log::error!("failed to reposition popover: {e}");
                }
            }
            if let Err(e) = w.show() { log::error!("failed to show popover: {e}"); }
            if let Err(e) = w.set_focus() { log::error!("failed to focus popover: {e}"); }
        }
        return;
    }

    let pos = icon_rect.map(|rect| popover_position(app, rect));
    build_popover(app, pos);
}

// Create the popover window, optionally anchored at `pos` (under the tray icon
// or a menu-bar fallback). Wires up light-dismiss on focus loss.
fn build_popover(app: &tauri::AppHandle, pos: Option<tauri::LogicalPosition<f64>>) {
    let mut builder = tauri::WebviewWindowBuilder::new(
        app,
        "popover",
        tauri::WebviewUrl::App("/".into()),
    )
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(true)
    .inner_size(POPOVER_W, POPOVER_H);

    if let Some(p) = pos {
        builder = builder.position(p.x, p.y);
    }

    match builder.build() {
        Ok(window) => {
            #[cfg(target_os = "macos")]
            apply_popover_vibrancy(&window);

            // Light-dismiss: hide the popover whenever it loses focus (click
            // outside, app switch). Record the time so the tray handler can
            // tell a dismiss-click apart from a fresh open-click.
            let app_handle = app.clone();
            let win = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(false) = event {
                    if let Some(t) = app_handle.try_state::<PopoverHideTime>() {
                        if let Ok(mut g) = t.0.lock() {
                            *g = Some(std::time::Instant::now());
                        }
                    }
                    let _ = win.hide();
                }
            });

            let _ = window.set_focus();
        }
        Err(e) => log::error!("failed to create popover window: {e}"),
    }
}

// Show the popover anchored near the menu bar, creating it if needed. Used to
// reveal the tray location at the end of onboarding.
fn open_popover_at_menubar(app: &tauri::AppHandle) {
    let pos = popover_position_menubar(app);
    if let Some(w) = app.get_webview_window("popover") {
        let _ = w.set_position(pos);
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        build_popover(app, Some(pos));
    }
}

fn show_capture_overlay(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("capture-overlay") {
        if let Err(e) = w.show() { log::error!("failed to show capture overlay: {e}"); }
        if let Err(e) = w.set_focus() { log::error!("failed to focus capture overlay: {e}"); }
        return;
    }

    // Cover all screens without using macOS full-screen mode (which creates a new Space).
    // DisplayInfo.width/height are already in logical pixels — do NOT divide by scale_factor.
    let (origin_x, origin_y, total_w, total_h) = screenshots::Screen::all()
        .unwrap_or_default()
        .iter()
        .fold((0i32, 0i32, 0f64, 0f64), |(ox, oy, tw, th), s| {
            let d = &s.display_info;
            let right  = d.x as f64 + d.width  as f64;
            let bottom = d.y as f64 + d.height as f64;
            (ox.min(d.x), oy.min(d.y), tw.max(right), th.max(bottom))
        });

    let result = tauri::WebviewWindowBuilder::new(
        app,
        "capture-overlay",
        tauri::WebviewUrl::App("/capture".into()),
    )
    .transparent(true)
    .decorations(false)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .position(origin_x as f64, origin_y as f64)
    .inner_size(total_w - origin_x as f64, total_h - origin_y as f64)
    .build();

    if let Err(e) = result {
        log::error!("failed to create capture overlay: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_truthy_treats_set_values_as_on() {
        assert!(is_truthy(Some("1".into())));
        assert!(is_truthy(Some("true".into())));
        assert!(is_truthy(Some("yes".into())));
        assert!(is_truthy(Some("anything".into())));
        assert!(is_truthy(Some("  1  ".into())));
    }

    #[test]
    fn is_truthy_treats_unset_and_falsey_as_off() {
        assert!(!is_truthy(None));
        assert!(!is_truthy(Some("".into())));
        assert!(!is_truthy(Some("0".into())));
        assert!(!is_truthy(Some("false".into())));
        assert!(!is_truthy(Some("no".into())));
        assert!(!is_truthy(Some("  ".into())));
    }
}
