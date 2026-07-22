//! Window management: the tray popover, the fullscreen capture overlay, and
//! the onboarding window — creation, positioning, and dismiss behavior.

use std::sync::Mutex;

use tauri::Manager;

/// Tracks when the popover was last auto-hidden on focus loss, so a tray-icon
/// click that triggered that blur doesn't immediately re-open the window.
#[derive(Default)]
pub struct PopoverHideTime(Mutex<Option<std::time::Instant>>);

const POPOVER_W: f64 = 320.0;
const POPOVER_H: f64 = 520.0;

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

pub fn toggle_popover(app: &tauri::AppHandle, icon_rect: Option<tauri::Rect>) {
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
pub fn open_popover_at_menubar(app: &tauri::AppHandle) {
    let pos = popover_position_menubar(app);
    if let Some(w) = app.get_webview_window("popover") {
        let _ = w.set_position(pos);
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        build_popover(app, Some(pos));
    }
}

pub fn show_capture_overlay(app: &tauri::AppHandle) {
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

// Show onboarding immediately when the model isn't cached yet, so the user
// watches setup progress instead of a blank app. Built on the main thread
// (`.setup` runs there) rather than inside the setup worker, so onboarding
// shows up exactly once per launch regardless of how many times setup itself
// is retried.
pub fn build_onboarding(app: &tauri::AppHandle) {
    let builder = tauri::WebviewWindowBuilder::new(
        app,
        "onboarding",
        tauri::WebviewUrl::App("/".into()),
    )
    .title("Welcome to Beaver")
    .inner_size(480.0, 640.0)
    .center();
    // Borderless chrome: let the dark UI fill to the top edge with the
    // traffic lights floating over it, instead of a white system title bar.
    #[cfg(target_os = "macos")]
    let builder = builder
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay);
    if let Err(e) = builder.build() {
        log::error!("failed to create onboarding window: {e}");
    }
}

// Show the Settings window, creating it if needed. A plain, resizable-off
// utility window with a standard title bar — unlike onboarding's branded
// borderless chrome, Settings doesn't need a first-run "moment."
pub fn show_settings(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        if let Err(e) = w.show() { log::error!("failed to show settings window: {e}"); }
        if let Err(e) = w.set_focus() { log::error!("failed to focus settings window: {e}"); }
        return;
    }
    build_settings(app);
}

fn build_settings(app: &tauri::AppHandle) {
    let result = tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("/".into()),
    )
    .title("Beaver Settings")
    .inner_size(480.0, 420.0)
    .resizable(false)
    .center()
    .build();

    if let Err(e) = result {
        log::error!("failed to create settings window: {e}");
    }
}
