//! App wiring: plugins, tray icon, global shortcut, managed state, and the
//! run-event policy. The pieces live in focused modules — `commands` (the
//! frontend-facing surface), `windows` (popover/overlay/onboarding), `server`
//! (local engine supervision), `engine` (the vision backends).

mod capture;
mod commands;
mod db;
mod engine;
mod permission;
mod prompts;
mod server;
mod settings;
mod shortcut;
mod update;
mod windows;

use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub(crate) fn is_truthy(val: Option<String>) -> bool {
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            log::info!(
                "Beaver v{} starting; logs in {:?}",
                app.package_info().version,
                app.path().app_log_dir().ok()
            );

            #[cfg(target_os = "macos")]
            let _ = app.handle().set_activation_policy(tauri::ActivationPolicy::Accessory);

            app.manage(windows::PopoverHideTime::default());
            app.manage(commands::LastCapture::default());

            // Right-click tray menu. Beaver stays alive when its windows close
            // (see the ExitRequested guard in `run`), so this Quit item is the
            // only way out. A custom item firing `app.exit(0)` is used instead of
            // the predefined Quit, whose OS-level terminate would be swallowed by
            // that same guard.
            let tray_menu = MenuBuilder::new(app)
                .text("settings", "Settings…")
                .text("quit", "Quit Beaver")
                .build()?;

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
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "settings" => windows::show_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
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
                        windows::toggle_popover(app, Some(rect));
                    }
                })
                .build(app)?;

            let initial_shortcut = settings::load(app.handle()).shortcut;
            if let Err(e) = shortcut::apply(app.handle(), &initial_shortcut, None) {
                log::error!("failed to register shortcut '{initial_shortcut}': {e}");
            }

            // Pick a free localhost port and register server state up front so
            // commands can read it immediately.
            let port = server::free_port().unwrap_or(11500);
            app.manage(server::EngineState::new(port));

            let first_launch = !server::setup_is_complete(app.handle()) || force_onboarding_enabled();
            if first_launch {
                windows::build_onboarding(app.handle());
            }

            // Build the env (first run only), spawn the server, and poll it to
            // readiness — all off the main thread so the tray is usable at once.
            server::spawn_setup(app.handle().clone());

            // After the permission relaunch, surface the popover once so the
            // user lands somewhere instead of a silent menu-bar app.
            if server::take_permission_relaunch(app.handle()) {
                windows::open_popover_at_menubar(app.handle());
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture_and_extract,
            commands::re_extract,
            commands::engine_status,
            commands::write_to_clipboard,
            commands::finish_onboarding,
            commands::retry_setup,
            commands::screen_permission_granted,
            commands::request_screen_permission,
            commands::open_screen_recording_settings,
            commands::relaunch_app,
            commands::check_for_update,
            commands::open_external,
            commands::get_settings,
            commands::update_settings,
            commands::open_settings
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
                if let Some(state) = app.try_state::<server::EngineState>() {
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
