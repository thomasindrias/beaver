mod capture;
mod db;
mod ollama;
mod shortcut;

use base64::{engine::general_purpose::STANDARD, Engine};
use std::sync::Mutex;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_shell::{process::CommandChild, ShellExt};


#[allow(dead_code)]
struct OllamaChild(Mutex<Option<CommandChild>>);

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
        .plugin(tauri_plugin_shell::init())
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

            // Start Ollama sidecar — keep CommandChild in state so it isn't dropped/killed
            let sidecar = app.shell().sidecar("ollama")
                .expect("ollama sidecar not configured")
                // Never hold more than one model resident at a time.
                .env("OLLAMA_MAX_LOADED_MODELS", "1");
            match sidecar.args(["serve"]).spawn() {
                Ok((_rx, child)) => {
                    app.manage(OllamaChild(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("Osprey: failed to start Ollama sidecar: {e}");
                    app.manage(OllamaChild(Mutex::new(None)));
                }
            }

            // Wait for Ollama and decide on onboarding OFF the main thread, so the
            // tray icon and app become usable immediately instead of blocking on a
            // sidecar that can take several seconds to bind its port.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
                let mut ready = false;
                while std::time::Instant::now() < deadline {
                    if tauri::async_runtime::block_on(ollama::is_running()) {
                        ready = true;
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(300));
                }
                if !ready {
                    eprintln!("Osprey: Ollama is not reachable — captures will fail");
                    return;
                }
                if !tauri::async_runtime::block_on(ollama::is_model_installed()) {
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
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![capture_and_extract, ollama_is_running, model_is_installed, write_to_clipboard, show_success_notification, is_first_launch, pull_model])
        .run(tauri::generate_context!())
        .expect("error while running Osprey");
}

#[tauri::command]
async fn ollama_is_running() -> bool {
    ollama::is_running().await
}

#[tauri::command]
async fn model_is_installed() -> bool {
    ollama::is_model_installed().await
}

// Capture and extract in one hop: the (multi-MB) image bytes stay in Rust and
// are base64-encoded once for Ollama, instead of round-tripping to the frontend
// and back across the IPC boundary as a giant string.
#[tauri::command]
async fn capture_and_extract(region: capture::CaptureRegion) -> Result<String, String> {
    let bytes = capture::capture_region(&region).map_err(|e| e.to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    ollama::extract_from_image(&image_base64).await
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


#[tauri::command]
async fn is_first_launch() -> bool {
    !ollama::is_model_installed().await
}

#[tauri::command]
async fn pull_model(window: tauri::WebviewWindow) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut resp = client
        .post(ollama::api_url("/api/pull"))
        .json(&serde_json::json!({ "model": ollama::MODEL_NAME, "stream": true }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    use tauri::Emitter;
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        if let Ok(text) = std::str::from_utf8(&chunk) {
            for line in text.lines().filter(|l| !l.is_empty()) {
                let _ = window.emit("model-pull-progress", line);
            }
        }
    }
    Ok(())
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

    if let Some(rect) = icon_rect {
        let p = popover_position(app, rect);
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

fn show_capture_overlay(app: &tauri::AppHandle) {
    // Warm the vision model now so the cold-load happens while the user drags
    // the selection, not after they release.
    tauri::async_runtime::spawn(ollama::warm_model());

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
