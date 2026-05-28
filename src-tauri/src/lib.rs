mod capture;
mod db;
mod ollama;
mod shortcut;

use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_shell::ShellExt;

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
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("app bundle must include an icon").clone())
                .tooltip("Osprey")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        toggle_popover(app);
                    }
                })
                .build(app)?;

            let sc: Shortcut = shortcut::CAPTURE_SHORTCUT.parse().expect("invalid shortcut");
            app.global_shortcut().on_shortcut(sc, |app, _sc, event| {
                if event.state == ShortcutState::Pressed {
                    show_capture_overlay(app);
                }
            })?;

            // Start Ollama sidecar
            let sidecar = app.shell().sidecar("ollama")
                .expect("ollama sidecar not configured");
            match sidecar.args(["serve"]).spawn() {
                Ok(_) => {
                    // Give Ollama time to initialise
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                }
                Err(e) => eprintln!("Osprey: failed to start Ollama sidecar: {e}"),
            }

            let needs_onboarding = !tauri::async_runtime::block_on(ollama::is_model_installed());
            if needs_onboarding {
                let result = tauri::WebviewWindowBuilder::new(
                    app,
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
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![capture_screen_region, ollama_is_running, model_is_installed, extract_from_image, write_to_clipboard, show_success_notification, is_first_launch, pull_model])
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

#[tauri::command]
async fn extract_from_image(image_base64: String) -> Result<String, String> {
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
async fn capture_screen_region(region: capture::CaptureRegion) -> Result<String, String> {
    let bytes = capture::capture_region(&region).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(&bytes))
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

fn toggle_popover(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("popover") {
        if w.is_visible().unwrap_or(false) {
            if let Err(e) = w.hide() { eprintln!("Osprey: failed to hide popover: {e}"); }
        } else {
            if let Err(e) = w.show() { eprintln!("Osprey: failed to show popover: {e}"); }
            if let Err(e) = w.set_focus() { eprintln!("Osprey: failed to focus popover: {e}"); }
        }
        return;
    }
    let result = tauri::WebviewWindowBuilder::new(
        app,
        "popover",
        tauri::WebviewUrl::App("/".into()),
    )
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .inner_size(320.0, 520.0)
    .build();

    if let Err(e) = result {
        eprintln!("Osprey: failed to create popover window: {e}");
    }
}

fn show_capture_overlay(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("capture-overlay") {
        if let Err(e) = w.show() { eprintln!("Osprey: failed to show capture overlay: {e}"); }
        if let Err(e) = w.set_focus() { eprintln!("Osprey: failed to focus capture overlay: {e}"); }
        return;
    }
    let result = tauri::WebviewWindowBuilder::new(
        app,
        "capture-overlay",
        tauri::WebviewUrl::App("/capture".into()),
    )
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .fullscreen(true)
    .build();

    if let Err(e) = result {
        eprintln!("Osprey: failed to create capture overlay: {e}");
    }
}
