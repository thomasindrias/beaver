mod db;

use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};

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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running Osprey");
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
