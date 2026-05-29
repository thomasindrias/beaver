mod capture;
mod db;
mod mlx;
mod server;
mod shortcut;

use base64::{engine::general_purpose::STANDARD, Engine};
use std::sync::Mutex;
use tauri::{
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
        eprintln!("Osprey: failed to apply vibrancy: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:osprey.db", db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            let _ = app.handle().set_activation_policy(tauri::ActivationPolicy::Accessory);

            app.manage(PopoverHideTime(Mutex::new(None)));

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("app bundle must include an icon").clone())
                .tooltip("Osprey")
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
            app.manage(server::MlxServer {
                port,
                child: Mutex::new(None),
                phase: Mutex::new(server::SetupPhase::BuildingEnv),
            });

            // Build the venv (first run only), spawn the server, and poll it to
            // readiness — all off the main thread so the tray is usable at once.
            // Show onboarding immediately when the model isn't cached yet, so the
            // user watches setup progress instead of a blank app.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let state = handle.state::<server::MlxServer>();
                let first_launch = !server::setup_is_complete(&handle);

                if first_launch {
                    let h = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        let result = tauri::WebviewWindowBuilder::new(
                            &h,
                            "onboarding",
                            tauri::WebviewUrl::App("/".into()),
                        )
                        .title("Welcome to Osprey")
                        .inner_size(480.0, 540.0)
                        .center()
                        .build();
                        if let Err(e) = result {
                            eprintln!("Osprey: failed to create onboarding window: {e}");
                        }
                    });
                }

                if !server::env_is_ready(&handle) {
                    *state.phase.lock().unwrap() = server::SetupPhase::BuildingEnv;
                    if let Err(e) = server::build_env(&handle) {
                        eprintln!("Osprey: MLX env build failed: {e}");
                        *state.phase.lock().unwrap() = server::SetupPhase::Failed;
                        return;
                    }
                }

                *state.phase.lock().unwrap() = server::SetupPhase::StartingServer;
                match server::spawn_server(&handle, state.port) {
                    Ok(child) => {
                        *state.child.lock().unwrap() = Some(child);
                    }
                    Err(e) => {
                        eprintln!("Osprey: failed to spawn MLX server: {e}");
                        *state.phase.lock().unwrap() = server::SetupPhase::Failed;
                        return;
                    }
                }

                // Poll to readiness. Do NOT impose a wall-clock deadline while the
                // server is reachable and reports progress — the first run can
                // download a few hundred MB of deps plus a ~3 GB model on a slow
                // link. Only fail if the server stays UNREACHABLE for a sustained
                // window (the process likely died), with a generous absolute cap
                // as a final backstop.
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
                                    *state.phase.lock().unwrap() = server::SetupPhase::Failed;
                                    break;
                                }
                                // downloading / loading — keep waiting.
                                _ => {}
                            }
                        }
                        Err(_) => {
                            if last_reachable.elapsed() > unreachable_grace {
                                eprintln!("Osprey: MLX server unreachable — giving up");
                                *state.phase.lock().unwrap() = server::SetupPhase::Failed;
                                break;
                            }
                        }
                    }
                    if started.elapsed() > absolute_cap {
                        eprintln!("Osprey: MLX server setup exceeded the time cap");
                        *state.phase.lock().unwrap() = server::SetupPhase::Failed;
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_and_extract,
            mlx_status,
            write_to_clipboard,
            show_success_notification,
            is_first_launch,
            finish_onboarding
        ])
        .build(tauri::generate_context!())
        .expect("error while building Osprey")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<server::MlxServer>() {
                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}

#[tauri::command]
async fn mlx_status(state: tauri::State<'_, server::MlxServer>) -> Result<String, ()> {
    // Copy the cheap bits out before any await so we never hold the lock across it.
    let phase = *state.phase.lock().unwrap();
    let port = state.port;

    let label = match phase {
        server::SetupPhase::BuildingEnv => "preparing".to_string(),
        server::SetupPhase::Failed => "error".to_string(),
        server::SetupPhase::StartingServer | server::SetupPhase::ServerUp => {
            match mlx::health(port).await {
                Ok(h) => match h.status {
                    mlx::ServerStatus::Downloading => "downloading",
                    mlx::ServerStatus::Loading => "loading",
                    mlx::ServerStatus::Ready => "ready",
                    mlx::ServerStatus::Error => "error",
                }
                .to_string(),
                Err(_) => "starting".to_string(),
            }
        }
    };
    Ok(label)
}

// Capture and extract in one hop: the (multi-MB) image bytes stay in Rust and
// are base64-encoded once for the MLX server, instead of round-tripping to the
// frontend and back across the IPC boundary as a giant string.
#[tauri::command]
async fn capture_and_extract(
    region: capture::CaptureRegion,
    state: tauri::State<'_, server::MlxServer>,
) -> Result<String, String> {
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

#[tauri::command]
async fn show_success_notification(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title("Osprey")
        .body("Copied to clipboard.")
        .show()
        .map_err(|e| e.to_string())
}

// First launch == setup has never completed (no marker), so onboarding runs.
#[tauri::command]
async fn is_first_launch(app: tauri::AppHandle) -> bool {
    !server::setup_is_complete(&app)
}

// End onboarding once setup is ready: surface the menu-bar popover so the user
// discovers where Osprey lives, then close the onboarding window. We re-assert
// the setup marker first so the popover (which reads is_first_launch on mount)
// can't race into rendering the onboarding view again.
#[tauri::command]
fn finish_onboarding(app: tauri::AppHandle) {
    server::mark_setup_complete(&app);
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
// monitor points the user at the Osprey tray icon.
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
            if let Err(e) = w.hide() { eprintln!("Osprey: failed to hide popover: {e}"); }
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
                    eprintln!("Osprey: failed to reposition popover: {e}");
                }
            }
            if let Err(e) = w.show() { eprintln!("Osprey: failed to show popover: {e}"); }
            if let Err(e) = w.set_focus() { eprintln!("Osprey: failed to focus popover: {e}"); }
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
        Err(e) => eprintln!("Osprey: failed to create popover window: {e}"),
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
        if let Err(e) = w.show() { eprintln!("Osprey: failed to show capture overlay: {e}"); }
        if let Err(e) = w.set_focus() { eprintln!("Osprey: failed to focus capture overlay: {e}"); }
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
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .position(origin_x as f64, origin_y as f64)
    .inner_size(total_w - origin_x as f64, total_h - origin_y as f64)
    .build();

    if let Err(e) = result {
        eprintln!("Osprey: failed to create capture overlay: {e}");
    }
}
