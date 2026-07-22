use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const CAPTURE_SHORTCUT: &str = "CmdOrCtrl+Shift+D";

/// Register `new_accelerator` as the global capture shortcut, then drop
/// `previous_accelerator` (if any and if different). Registers the new
/// binding *before* touching the old one deliberately: if `new_accelerator`
/// is already taken at the OS level, this returns `Err` having changed
/// nothing, so the previous shortcut keeps working — the caller never ends
/// up with zero shortcuts registered because a rejected change happened to
/// clear the old one first.
pub fn apply(
    app: &tauri::AppHandle,
    new_accelerator: &str,
    previous_accelerator: Option<&str>,
) -> Result<(), String> {
    let sc: Shortcut = new_accelerator
        .parse()
        .map_err(|_| format!("'{new_accelerator}' is not a valid shortcut"))?;
    let gs = app.global_shortcut();
    gs.on_shortcut(sc, |app, _sc, event| {
        if event.state == ShortcutState::Pressed {
            crate::windows::show_capture_overlay(app);
        }
    })
    .map_err(|e| e.to_string())?;

    if let Some(prev) = previous_accelerator {
        if prev != new_accelerator {
            if let Ok(prev_sc) = prev.parse::<Shortcut>() {
                if let Err(e) = gs.unregister(prev_sc) {
                    log::warn!("failed to unregister previous shortcut '{prev}': {e}");
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortcut_contains_modifier_and_key() {
        assert!(CAPTURE_SHORTCUT.contains("Shift"));
        assert!(CAPTURE_SHORTCUT.contains('D'));
    }
}
