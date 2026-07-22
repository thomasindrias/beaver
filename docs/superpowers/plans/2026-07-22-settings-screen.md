# Settings Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Beaver's first Settings screen — a dedicated window exposing default output format, capture shortcut, history retention, and the update-check toggle, plus a non-interactive engine stub, per `docs/superpowers/specs/2026-07-22-settings-screen-design.md`.

**Architecture:** A hand-rolled `Settings` struct persisted as JSON in `app_data_dir()` (no new dependency), read synchronously from Rust at `.setup()` time for the shortcut and lazily elsewhere. Exposed to the frontend only through `commands.rs`/`api.ts`, matching the existing single-typed-command-surface convention. A new `"settings"` `WebviewWindow`, singleton like the existing popover/onboarding windows, reachable from a popover gear icon and a tray menu item.

**Tech Stack:** Rust (Tauri 2, `tauri-plugin-global-shortcut` 2.3.1), React 19 + TypeScript, Vitest + Testing Library, existing shadcn `Button` primitive.

## Global Constraints

- No new Cargo or npm dependencies (settings persistence is hand-rolled `std::fs` + `serde_json`, both already present).
- All frontend/backend IPC goes through `src-tauri/src/commands.rs` and its typed mirror `src/lib/api.ts` — no direct `invoke()` calls from components, no parallel plugin-JS-API path for settings.
- Struct fields stay snake_case end to end (Rust ↔ JSON ↔ TypeScript) — matches the existing `Capture`/`CaptureRegion` convention, no `rename_all = "camelCase"`.
- `#[serde(default)]` on `Settings` (backed by a manual `impl Default`) so a future field addition never breaks an existing `settings.json`.
- TDD throughout: write the failing test, watch it fail, implement the minimum to pass, run again, commit. Where a step is genuinely untestable at the unit level (Tauri commands and window-builders that require a live `AppHandle`), this plan says so explicitly and why, matching the existing convention in `server.rs`/`windows.rs` (their `AppHandle`-taking functions have no unit tests either) — never silently skip a test that could exist.
- YAGNI: no settings validation beyond the shortcut path (format/retention/update-toggle are closed enums a UI can't misuse), no in-memory settings cache, no BYO cloud or presets work.

---

### Task 1: `settings.rs` — persisted settings struct

**Files:**
- Modify: `src-tauri/src/prompts.rs:7` (add `Serialize` to `ExtractFormat`'s derive)
- Create: `src-tauri/src/settings.rs`
- Modify: `src-tauri/src/lib.rs:9-18` (add `mod settings;`)

**Interfaces:**
- Produces: `settings::Settings { default_format: ExtractFormat, shortcut: String, history_retention_days: Option<u32>, update_check_enabled: bool }`, implementing `Default`, `Clone`, `Debug`, `PartialEq`, `Serialize`, `Deserialize`. `settings::load(app: &tauri::AppHandle) -> Settings`, `settings::save(app: &tauri::AppHandle, s: &Settings) -> std::io::Result<()>`. Both used by Task 4 (`commands.rs`) and Task 5 (`lib.rs`).

- [ ] **Step 1: Add `Serialize` to `ExtractFormat` so `Settings` can serialize it**

In `src-tauri/src/prompts.rs`, change line 7 from:

```rust
#[derive(serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
```

to:

```rust
#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
```

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/settings.rs` with only the test module (the production items it references don't exist yet — this is the RED state):

```rust
//! Persisted user settings: default output format, capture shortcut,
//! history retention, and the update-check toggle. Stored as JSON in
//! `app_data_dir()`, following the same blocking-`std::fs` pattern
//! `server.rs` uses for its setup marker file.

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("beaver-settings-test-{name}.json"))
    }

    #[test]
    fn load_from_missing_file_returns_defaults() {
        let path = scratch_path("missing");
        let _ = std::fs::remove_file(&path);
        assert_eq!(load_from(&path), Settings::default());
    }

    #[test]
    fn load_from_corrupt_json_returns_defaults() {
        let path = scratch_path("corrupt");
        std::fs::write(&path, b"not valid json").unwrap();
        assert_eq!(load_from(&path), Settings::default());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn save_then_load_round_trips() {
        let path = scratch_path("roundtrip");
        let settings = Settings {
            default_format: crate::prompts::ExtractFormat::Json,
            shortcut: "CmdOrCtrl+Shift+X".to_string(),
            history_retention_days: Some(30),
            update_check_enabled: false,
        };
        save_to(&path, &settings).unwrap();
        assert_eq!(load_from(&path), settings);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn load_from_tolerates_fields_missing_from_an_older_file() {
        let path = scratch_path("forward-compat");
        std::fs::write(&path, br#"{"shortcut":"CmdOrCtrl+Shift+Z"}"#).unwrap();
        let settings = load_from(&path);
        assert_eq!(settings.shortcut, "CmdOrCtrl+Shift+Z");
        assert_eq!(settings.default_format, crate::prompts::ExtractFormat::Markdown);
        assert!(settings.update_check_enabled);
        assert_eq!(settings.history_retention_days, None);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn default_settings_use_the_hardcoded_capture_shortcut() {
        assert_eq!(Settings::default().shortcut, crate::shortcut::CAPTURE_SHORTCUT);
    }
}
```

In `src-tauri/src/lib.rs`, add `mod settings;` after `mod server;` (line 16), keeping the alphabetical module order:

```rust
mod server;
mod settings;
mod shortcut;
```

- [ ] **Step 3: Run the tests and confirm they fail to compile**

Run: `cd src-tauri && cargo test settings::tests`
Expected: compile error — `Settings`, `load_from`, and `save_to` are not defined in this scope.

- [ ] **Step 4: Implement `Settings`, `load_from`, `save_to`, and the `AppHandle` wrappers**

Add above the test module in `src-tauri/src/settings.rs`:

```rust
use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::prompts::ExtractFormat;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub default_format: ExtractFormat,
    pub shortcut: String,
    pub history_retention_days: Option<u32>,
    pub update_check_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_format: ExtractFormat::Markdown,
            shortcut: crate::shortcut::CAPTURE_SHORTCUT.to_string(),
            history_retention_days: None,
            update_check_enabled: true,
        }
    }
}

/// Pure load: parses `path`, falling back to defaults if the file is
/// missing or fails to parse (logged, never fatal — a corrupt settings
/// file must not block startup).
fn load_from(path: &Path) -> Settings {
    match std::fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_else(|e| {
            log::warn!("failed to parse settings file, using defaults: {e}");
            Settings::default()
        }),
        Err(_) => Settings::default(),
    }
}

/// Pure save: writes `settings` as pretty JSON to `path`, creating the
/// parent directory if needed.
fn save_to(path: &Path, settings: &Settings) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(settings).expect("Settings serialization cannot fail");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, json)
}

fn settings_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir must resolve")
        .join("settings.json")
}

pub fn load(app: &tauri::AppHandle) -> Settings {
    load_from(&settings_path(app))
}

pub fn save(app: &tauri::AppHandle, settings: &Settings) -> std::io::Result<()> {
    save_to(&settings_path(app), settings)
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd src-tauri && cargo test settings::tests`
Expected: `test result: ok. 5 passed`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/prompts.rs src-tauri/src/settings.rs src-tauri/src/lib.rs
git commit -m "feat: add persisted Settings struct"
```

---

### Task 2: `shortcut.rs` — dynamic (re)registration

**Files:**
- Modify: `src-tauri/src/shortcut.rs` (whole file — currently just a constant + one test)

**Interfaces:**
- Consumes: `crate::windows::show_capture_overlay(app: &tauri::AppHandle)` (already exists, unchanged).
- Produces: `shortcut::apply(app: &tauri::AppHandle, new_accelerator: &str, previous_accelerator: Option<&str>) -> Result<(), String>`, used by Task 4 (`commands::update_settings`) and Task 5 (`lib.rs`'s `.setup()`, passing `None` for `previous_accelerator`).

**Why this task has no new unit test:** `apply()` needs a live `tauri::AppHandle` to call `global_shortcut()` — this codebase has no Tauri mock-runtime harness (`server.rs`'s `AppHandle`-taking functions like `mark_setup_complete`/`setup_marker` are likewise untested at the unit level; only their pure helpers like `free_port` are). The one new pure fact worth pinning — that the shortcut string format is valid — is already covered by the existing `shortcut_contains_modifier_and_key` test below, which stays unchanged. `apply()` itself is covered by the manual verification pass at the end of this plan (Task 12's follow-up).

- [ ] **Step 1: Implement `apply()`**

Replace the full contents of `src-tauri/src/shortcut.rs` with:

```rust
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
```

- [ ] **Step 2: Confirm it compiles**

Run: `cd src-tauri && cargo test shortcut::tests`
Expected: `test result: ok. 1 passed` (the pre-existing test, now recompiled against the new file).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/shortcut.rs
git commit -m "feat: support dynamic shortcut re-registration"
```

---

### Task 3: `windows.rs` — Settings window

**Files:**
- Modify: `src-tauri/src/windows.rs` (append two new functions)

**Interfaces:**
- Produces: `windows::show_settings(app: &tauri::AppHandle)`, used by Task 4 (`commands::open_settings`) and Task 5 (the new tray menu item).

**Why this task has no new unit test:** window construction is a Tauri-runtime side effect with no return value to assert on — none of the existing window builders (`build_popover`, `build_onboarding`, `show_capture_overlay`) have unit tests either, only the pure position-math helpers do (and those aren't tested today either — an existing gap this plan doesn't expand scope to fix). Verified manually in Task 12's follow-up.

- [ ] **Step 1: Implement `build_settings` / `show_settings`**

Append to `src-tauri/src/windows.rs`:

```rust
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
```

- [ ] **Step 2: Confirm it compiles**

Run: `cd src-tauri && cargo build`
Expected: builds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/windows.rs
git commit -m "feat: add Settings window"
```

---

### Task 4: `commands.rs` — settings commands + wire format/update-check

**Files:**
- Modify: `src-tauri/src/commands.rs:1` (import list)
- Modify: `src-tauri/src/commands.rs:19-33` (`capture_and_extract`)
- Modify: `src-tauri/src/commands.rs:155-181` (`check_for_update`)
- Modify: `src-tauri/src/commands.rs` (append `get_settings`, `update_settings`, `open_settings`)

**Interfaces:**
- Consumes: `settings::Settings`, `settings::load`, `settings::save` (Task 1); `shortcut::apply` (Task 2); `windows::show_settings` (Task 3).
- Produces: three new `#[tauri::command]` functions — `get_settings(app) -> Settings`, `update_settings(app, next: Settings) -> Result<Settings, String>`, `open_settings(app)` — registered in Task 5's `invoke_handler!`.

**Why this task has no new unit test:** every function here is a `#[tauri::command]` requiring `AppHandle`/`State` injection, same as every existing command in this file (`capture_and_extract`, `check_for_update`, `finish_onboarding`, etc.) — none of them are unit tested; only the pure `LastCapture` struct behavior is (see the existing test module). Verified via the frontend tests in Tasks 6–11 (which mock the command layer at the `invoke()` boundary) and manual verification in Task 12's follow-up.

- [ ] **Step 1: Add the new imports**

In `src-tauri/src/commands.rs`, change line 6 from:

```rust
use crate::{capture, engine, is_truthy, permission, prompts, server, update, windows};
```

to:

```rust
use crate::{capture, engine, is_truthy, permission, prompts, server, settings, shortcut, update, windows};
```

- [ ] **Step 2: Wire the default format into `capture_and_extract`**

In `src-tauri/src/commands.rs`, the current function (lines 19-33) is:

```rust
#[tauri::command]
pub async fn capture_and_extract(
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
    let prompt = prompts::prompt_for(format.unwrap_or(prompts::ExtractFormat::Markdown), None);
    engine::local::extract_from_image(port, &image_base64, &prompt).await
}
```

Replace it with:

```rust
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
```

- [ ] **Step 3: Gate `check_for_update` on the setting**

In `src-tauri/src/commands.rs`, the current function opens (lines 155-159):

```rust
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Option<update::UpdateInfo> {
    if is_truthy(std::env::var("BEAVER_DISABLE_UPDATE_CHECK").ok()) {
        return None;
    }
```

Change the body's opening to add the settings check right after the env-var check:

```rust
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Option<update::UpdateInfo> {
    if is_truthy(std::env::var("BEAVER_DISABLE_UPDATE_CHECK").ok()) {
        return None;
    }
    if !settings::load(&app).update_check_enabled {
        return None;
    }
```

(The rest of the function, from `let current = app.package_info()...` onward, is unchanged.)

- [ ] **Step 4: Add `get_settings`, `update_settings`, `open_settings`**

Append to `src-tauri/src/commands.rs`, above the `#[cfg(test)]` module:

```rust
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
            let _ = settings::save(&app, &current);
            return Err(e);
        }
    }
    Ok(next)
}

#[tauri::command]
pub fn open_settings(app: tauri::AppHandle) {
    windows::show_settings(&app);
}
```

- [ ] **Step 5: Confirm the crate still compiles and existing tests pass**

Run: `cd src-tauri && cargo test`
Expected: all existing tests still pass (the `LastCapture` tests in `commands.rs`, plus everything from Tasks 1–2).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: add settings commands, wire default format and update-check toggle"
```

---

### Task 5: `lib.rs` — wire settings into startup, tray menu, invoke handler

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `settings::load` (Task 1), `shortcut::apply` (Task 2), `windows::show_settings` (Task 3), `commands::get_settings`/`update_settings`/`open_settings` (Task 4).

**Why this task has no new unit test:** it only rewires `.setup()`'s startup sequence and the `invoke_handler!`/`MenuBuilder` registration lists — no new pure logic, same untested category as the rest of `lib.rs`'s `run()` function today (only `is_truthy` is unit tested in this file). Verified manually in the follow-up below.

- [ ] **Step 1: Replace the hardcoded shortcut registration**

In `src-tauri/src/lib.rs`, find:

```rust
            let sc: Shortcut = shortcut::CAPTURE_SHORTCUT.parse().expect("invalid shortcut");
            app.global_shortcut().on_shortcut(sc, |app, _sc, event| {
                if event.state == ShortcutState::Pressed {
                    windows::show_capture_overlay(app);
                }
            })?;
```

Replace it with:

```rust
            let initial_shortcut = settings::load(app.handle()).shortcut;
            if let Err(e) = shortcut::apply(app.handle(), &initial_shortcut, None) {
                log::error!("failed to register shortcut '{initial_shortcut}': {e}");
            }
```

Since `shortcut::apply` and `windows::show_capture_overlay` (called inside it) are now the only users of `Shortcut`/`ShortcutState` in this file, remove the now-unused import on line 22:

```rust
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
```

Delete this line entirely — `lib.rs` no longer references `GlobalShortcutExt`, `Shortcut`, or `ShortcutState` directly (they're used inside `shortcut.rs` now). The `tauri_plugin_global_shortcut::Builder::new().build()` plugin registration a few lines above stays unchanged.

- [ ] **Step 2: Add the tray menu item**

Find:

```rust
            let tray_menu = MenuBuilder::new(app).text("quit", "Quit Beaver").build()?;
```

Replace with:

```rust
            let tray_menu = MenuBuilder::new(app)
                .text("settings", "Settings…")
                .text("quit", "Quit Beaver")
                .build()?;
```

Find the menu event handler:

```rust
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "quit" {
                        app.exit(0);
                    }
                })
```

Replace with:

```rust
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "settings" => windows::show_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
```

- [ ] **Step 3: Register the new commands**

Find the `invoke_handler!` list, ending with:

```rust
            commands::check_for_update,
            commands::open_external
        ])
```

Replace with:

```rust
            commands::check_for_update,
            commands::open_external,
            commands::get_settings,
            commands::update_settings,
            commands::open_settings
        ])
```

- [ ] **Step 4: Build and run the full Rust test suite**

Run: `cd src-tauri && cargo build && cargo test`
Expected: builds cleanly (confirms the `Shortcut`/`ShortcutState` import removal didn't break anything else), all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: wire settings into startup, tray menu, and invoke handler"
```

---

### Task 6: `src/lib/api.ts` — typed Settings API

**Files:**
- Modify: `src/lib/api.ts` (append `Settings` type + three functions)
- Modify: `src/tests/api.test.ts` (append test cases)

**Interfaces:**
- Consumes: nothing new (mirrors Task 4's Rust commands by name).
- Produces: `Settings` type, `getSettings()`, `updateSettings(next: Settings)`, `openSettings()`, used by Task 9 (`SettingsPanel.tsx`) and Task 11 (`TrayPopover.tsx`).

- [ ] **Step 1: Write the failing tests**

In `src/tests/api.test.ts`, add inside the `describe("api", ...)` block (after the `openExternal` test, before the `it.each` block):

```ts
  it("getSettings queries the backend", async () => {
    const settings = {
      default_format: "markdown" as const,
      shortcut: "CmdOrCtrl+Shift+D",
      history_retention_days: null,
      update_check_enabled: true,
    };
    invokeMock.mockResolvedValue(settings);
    const result = await api.getSettings();
    expect(invokeMock).toHaveBeenCalledWith("get_settings");
    expect(result).toEqual(settings);
  });

  it("updateSettings sends the full settings object", async () => {
    const next = {
      default_format: "json" as const,
      shortcut: "CmdOrCtrl+Shift+X",
      history_retention_days: 30,
      update_check_enabled: false,
    };
    invokeMock.mockResolvedValue(next);
    await api.updateSettings(next);
    expect(invokeMock).toHaveBeenCalledWith("update_settings", { next });
  });
```

Also add `"openSettings"` / `"open_settings"` to the existing `it.each` table of no-payload commands:

```ts
  it.each([
    ["retrySetup", "retry_setup"],
    ["finishOnboarding", "finish_onboarding"],
    ["screenPermissionGranted", "screen_permission_granted"],
    ["requestScreenPermission", "request_screen_permission"],
    ["openScreenRecordingSettings", "open_screen_recording_settings"],
    ["relaunchApp", "relaunch_app"],
    ["checkForUpdate", "check_for_update"],
    ["openSettings", "open_settings"],
  ] as const)("%s invokes %s with no payload", async (fn, command) => {
    await api[fn]();
    expect(invokeMock).toHaveBeenCalledWith(command);
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm exec vitest run src/tests/api.test.ts`
Expected: FAIL — `api.getSettings is not a function` (and similarly for `updateSettings`/`openSettings`).

- [ ] **Step 3: Implement the API functions**

In `src/lib/api.ts`, add near the top (after the `ExtractFormat` import, before `CaptureRegion`):

```ts
export interface Settings {
  default_format: ExtractFormat;
  shortcut: string;
  history_retention_days: number | null;
  update_check_enabled: boolean;
}
```

Append at the end of the file:

```ts
export const getSettings = () => invoke<Settings>("get_settings");

export const updateSettings = (next: Settings) =>
  invoke<Settings>("update_settings", { next });

export const openSettings = () => invoke<void>("open_settings");
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm exec vitest run src/tests/api.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/tests/api.test.ts
git commit -m "feat: add typed Settings API"
```

---

### Task 7: `src/lib/accelerator.ts` — keydown → Tauri accelerator string

**Files:**
- Create: `src/lib/accelerator.ts`
- Create: `src/tests/accelerator.test.ts`

**Interfaces:**
- Produces: `toAccelerator(e: AcceleratorInput) -> string | null`, used by Task 9 (`SettingsPanel.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/tests/accelerator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toAccelerator } from "../lib/accelerator";

function key(overrides: Partial<Parameters<typeof toAccelerator>[0]>) {
  return {
    key: "d",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("toAccelerator", () => {
  it("translates Cmd+Shift+D", () => {
    expect(toAccelerator(key({ key: "d", metaKey: true, shiftKey: true }))).toBe(
      "CmdOrCtrl+Shift+D"
    );
  });

  it("translates Ctrl+Shift+X the same as Cmd (CmdOrCtrl)", () => {
    expect(toAccelerator(key({ key: "x", ctrlKey: true, shiftKey: true }))).toBe(
      "CmdOrCtrl+Shift+X"
    );
  });

  it("includes Alt when held", () => {
    expect(
      toAccelerator(key({ key: "p", metaKey: true, altKey: true }))
    ).toBe("CmdOrCtrl+Alt+P");
  });

  it("returns null for a bare modifier keypress", () => {
    expect(toAccelerator(key({ key: "Meta", metaKey: true }))).toBeNull();
    expect(toAccelerator(key({ key: "Shift", shiftKey: true }))).toBeNull();
  });

  it("returns null when no modifier is held", () => {
    expect(toAccelerator(key({ key: "d" }))).toBeNull();
  });

  it("uppercases single-character keys", () => {
    expect(toAccelerator(key({ key: "q", metaKey: true }))).toBe("CmdOrCtrl+Q");
  });

  it("passes named keys through unchanged", () => {
    expect(toAccelerator(key({ key: "F5", metaKey: true }))).toBe("CmdOrCtrl+F5");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm exec vitest run src/tests/accelerator.test.ts`
Expected: FAIL — cannot find module `../lib/accelerator`.

- [ ] **Step 3: Implement `toAccelerator`**

Create `src/lib/accelerator.ts`:

```ts
export interface AcceleratorInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const BARE_MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);

/**
 * Translates a captured keydown into a Tauri accelerator string
 * ("CmdOrCtrl+Shift+D"). Requires at least one of Cmd/Ctrl held (Beaver's
 * global shortcut needs a primary modifier); a bare modifier keypress or a
 * plain letter with no modifier returns null so the caller can keep
 * listening instead of committing a half-formed combo.
 */
export function toAccelerator(e: AcceleratorInput): string | null {
  if (BARE_MODIFIER_KEYS.has(e.key)) return null;
  if (!e.metaKey && !e.ctrlKey) return null;

  const parts = ["CmdOrCtrl"];
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join("+");
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm exec vitest run src/tests/accelerator.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accelerator.ts src/tests/accelerator.test.ts
git commit -m "feat: add keydown-to-accelerator translation"
```

---

### Task 8: `src/lib/routing.ts` — settings window view

**Files:**
- Modify: `src/lib/routing.ts`
- Modify: `src/tests/routing.test.ts`

**Interfaces:**
- Produces: `View` gains `"settings"`; `selectView` returns it when `windowLabel === "settings"`. Used by Task 10 (`App.tsx`).

- [ ] **Step 1: Write the failing test**

In `src/tests/routing.test.ts`, add inside the `describe("selectView", ...)` block:

```ts
  it("the settings window always shows settings", () => {
    expect(selectView("/", "settings")).toBe("settings");
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm exec vitest run src/tests/routing.test.ts`
Expected: FAIL — `expect(received).toBe(expected)`, received `"popover"` (settings falls through to the default).

- [ ] **Step 3: Implement the new view**

Replace the contents of `src/lib/routing.ts` with:

```ts
export type View = "capture" | "onboarding" | "popover" | "settings";

// Picks what a window renders from its route and Tauri window label. Keeping
// this independent of any "setup complete" flag is deliberate: the onboarding
// and popover windows must never swap content based on shared async state that
// can flip mid-load on a warm-cache first run.
export function selectView(route: string, windowLabel: string): View {
  if (route === "/capture") return "capture";
  if (windowLabel === "onboarding") return "onboarding";
  if (windowLabel === "settings") return "settings";
  return "popover";
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm exec vitest run src/tests/routing.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/routing.ts src/tests/routing.test.ts
git commit -m "feat: route the settings window to a dedicated view"
```

---

### Task 9: `src/components/SettingsPanel.tsx` — the settings UI

**Files:**
- Create: `src/components/SettingsPanel.tsx`
- Create: `src/tests/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `getSettings`, `updateSettings`, `type Settings` (Task 6, `../lib/api`); `toAccelerator` (Task 7, `../lib/accelerator`); `FORMATS` (existing export from `./CaptureHud`); `Kbd` (existing, `./Kbd`); `Logo` (existing, `./Logo`); `Button` (existing, `@/components/ui/button`).
- Produces: `SettingsPanel` component, used by Task 10 (`App.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/tests/SettingsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { SettingsPanel } from "../components/SettingsPanel";

const BASE_SETTINGS = {
  default_format: "markdown" as const,
  shortcut: "CmdOrCtrl+Shift+D",
  history_retention_days: null,
  update_check_enabled: true,
};

describe("SettingsPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "update_settings") return BASE_SETTINGS;
      return undefined;
    });
  });

  it("renders the current settings once loaded", async () => {
    render(<SettingsPanel />);
    expect(await screen.findByText("CmdOrCtrl+Shift+D")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("changing the format calls update_settings with the new value", async () => {
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_settings", {
        next: { ...BASE_SETTINGS, default_format: "json" },
      })
    );
  });

  it("toggling the update-check switch flips update_check_enabled", async () => {
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    fireEvent.click(screen.getByRole("button", { name: "Check automatically" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_settings", {
        next: { ...BASE_SETTINGS, update_check_enabled: false },
      })
    );
  });

  it("selecting a retention window calls update_settings with the day count", async () => {
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_settings", {
        next: { ...BASE_SETTINGS, history_retention_days: 30 },
      })
    );
  });

  it("recording a new shortcut applies it on keydown", async () => {
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    fireEvent.click(screen.getByTestId("shortcut-field"));
    expect(await screen.findByText("Press new shortcut…")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "x", metaKey: true, shiftKey: true });
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("update_settings", {
        next: { ...BASE_SETTINGS, shortcut: "CmdOrCtrl+Shift+X" },
      })
    );
  });

  it("shows an inline error and keeps the old shortcut when the update is rejected", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "update_settings") throw new Error("'CmdOrCtrl+Shift+X' is already taken");
      return undefined;
    });
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    fireEvent.click(screen.getByTestId("shortcut-field"));
    fireEvent.keyDown(window, { key: "x", metaKey: true, shiftKey: true });
    expect(
      await screen.findByText("'CmdOrCtrl+Shift+X' is already taken")
    ).toBeInTheDocument();
    expect(screen.getByText("CmdOrCtrl+Shift+D")).toBeInTheDocument();
  });

  it("the engine row is static and non-interactive", async () => {
    render(<SettingsPanel />);
    await screen.findByText("CmdOrCtrl+Shift+D");
    expect(screen.getByRole("button", { name: /Local \(on-device\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cloud — coming soon/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm exec vitest run src/tests/SettingsPanel.test.tsx`
Expected: FAIL — cannot find module `../components/SettingsPanel`.

- [ ] **Step 3: Implement `SettingsPanel`**

Create `src/components/SettingsPanel.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toAccelerator } from "../lib/accelerator";
import { getSettings, updateSettings, type Settings } from "../lib/api";
import { FORMATS } from "./CaptureHud";
import { Kbd } from "./Kbd";
import { Logo } from "./Logo";

const RETENTION_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Keep forever" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recording, setRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
  }, []);

  const apply = useCallback(async (next: Settings) => {
    try {
      const saved = await updateSettings(next);
      setSettings(saved);
      setShortcutError(null);
    } catch (e) {
      setShortcutError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!recording || !settings) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const accelerator = toAccelerator(e);
      if (!accelerator) return;
      setRecording(false);
      apply({ ...settings, shortcut: accelerator });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recording, settings, apply]);

  if (!settings) return null;

  return (
    <div className="flex h-screen w-full flex-col gap-5 bg-background px-6 py-5 text-foreground">
      <header className="flex items-center gap-2">
        <Logo size={20} />
        <span className="text-[15px] font-semibold tracking-tight">Settings</span>
      </header>

      <Row label="Default format">
        <div className="flex gap-1">
          {FORMATS.map(({ key, label }) => (
            <Button
              key={key}
              size="sm"
              variant={settings.default_format === key ? "default" : "outline"}
              aria-pressed={settings.default_format === key}
              onClick={() => apply({ ...settings, default_format: key })}
            >
              {label}
            </Button>
          ))}
        </div>
      </Row>

      <Row label="Capture shortcut">
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            data-testid="shortcut-field"
            onClick={() => setRecording(true)}
            className="rounded-md border border-border px-2 py-1 text-xs"
          >
            {recording ? "Press new shortcut…" : <Kbd>{settings.shortcut}</Kbd>}
          </button>
          {shortcutError && (
            <span className="text-[11px] text-destructive">{shortcutError}</span>
          )}
        </div>
      </Row>

      <Row label="History">
        <div className="flex gap-1">
          {RETENTION_OPTIONS.map(o => (
            <Button
              key={o.label}
              size="sm"
              variant={settings.history_retention_days === o.value ? "default" : "outline"}
              aria-pressed={settings.history_retention_days === o.value}
              onClick={() => apply({ ...settings, history_retention_days: o.value })}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </Row>

      <Row label="Updates">
        <Button
          size="sm"
          variant={settings.update_check_enabled ? "default" : "outline"}
          aria-pressed={settings.update_check_enabled}
          onClick={() =>
            apply({ ...settings, update_check_enabled: !settings.update_check_enabled })
          }
        >
          {settings.update_check_enabled ? "Check automatically" : "Off"}
        </Button>
      </Row>

      <Row label="Engine">
        <div className="flex gap-1">
          <Button size="sm" variant="default" disabled>
            🔒 Local (on-device)
          </Button>
          <Button size="sm" variant="outline" disabled>
            ☁️ Cloud — coming soon
          </Button>
        </div>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm exec vitest run src/tests/SettingsPanel.test.tsx`
Expected: PASS, all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPanel.tsx src/tests/SettingsPanel.test.tsx
git commit -m "feat: add SettingsPanel UI"
```

---

### Task 10: `src/App.tsx` — route to `SettingsPanel`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/tests/App.test.tsx`

**Interfaces:**
- Consumes: `SettingsPanel` (Task 9), `"settings"` view (Task 8).

- [ ] **Step 1: Write the failing test**

In `src/tests/App.test.tsx`, add a mock alongside the existing `TrayPopover`/`Onboarding` mocks:

```ts
vi.mock("../components/SettingsPanel", () => ({
  SettingsPanel: () => <div>settings-view</div>,
}));
```

Add a new test inside `describe("App window routing", ...)`:

```ts
  it("renders settings in the settings window", async () => {
    windowLabel.value = "settings";
    render(<App />);
    expect(await screen.findByText("settings-view")).toBeInTheDocument();
    expect(screen.queryByText("tray-popover")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm exec vitest run src/tests/App.test.tsx`
Expected: FAIL — `settings-view` never appears (falls through to `tray-popover`, and the `SettingsPanel` mock module doesn't match anything `App.tsx` imports yet).

- [ ] **Step 3: Wire the lazy import and render branch**

In `src/App.tsx`, add a lazy import alongside the existing two:

```tsx
const Onboarding = lazy(() =>
  import("./components/Onboarding").then(m => ({ default: m.Onboarding }))
);
const SettingsPanel = lazy(() =>
  import("./components/SettingsPanel").then(m => ({ default: m.SettingsPanel }))
);
```

Change the final render branch from:

```tsx
  return (
    <Suspense fallback={null}>
      {view === "onboarding" ? <Onboarding /> : <TrayPopover />}
    </Suspense>
  );
```

to:

```tsx
  return (
    <Suspense fallback={null}>
      {view === "onboarding" && <Onboarding />}
      {view === "settings" && <SettingsPanel />}
      {view === "popover" && <TrayPopover />}
    </Suspense>
  );
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm exec vitest run src/tests/App.test.tsx`
Expected: PASS, all tests green (including the pre-existing onboarding/popover routing tests).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/tests/App.test.tsx
git commit -m "feat: route the settings window to SettingsPanel"
```

---

### Task 11: `src/components/TrayPopover.tsx` — gear icon entry point

**Files:**
- Modify: `src/components/TrayPopover.tsx`
- Create: `src/tests/TrayPopover.test.tsx`

**Interfaces:**
- Consumes: `openSettings` (Task 6, `../lib/api`).

- [ ] **Step 1: Write the failing test**

Create `src/tests/TrayPopover.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { invokeMock, focusHandlers } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  focusHandlers: [] as Array<(e: { payload: boolean }) => void>,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: (handler: (e: { payload: boolean }) => void) => {
      focusHandlers.push(handler);
      return Promise.resolve(() => {});
    },
  }),
}));

import { TrayPopover } from "../components/TrayPopover";

describe("TrayPopover", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue([]);
  });

  it("opens Settings when the gear icon is clicked", async () => {
    render(<TrayPopover />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    expect(invokeMock).toHaveBeenCalledWith("open_settings");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm exec vitest run src/tests/TrayPopover.test.tsx`
Expected: FAIL — no element with role `button` and accessible name `Settings` exists yet.

- [ ] **Step 3: Add the gear icon**

In `src/components/TrayPopover.tsx`, add imports:

```tsx
import { Settings } from "lucide-react";
import { openSettings } from "../lib/api";
```

Change the header's right-hand group from:

```tsx
        <div className="ml-auto flex items-center gap-2">
          <UpdatePill />
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {captures.length} {captures.length === 1 ? "capture" : "captures"}
          </span>
        </div>
```

to:

```tsx
        <div className="ml-auto flex items-center gap-2">
          <UpdatePill />
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {captures.length} {captures.length === 1 ? "capture" : "captures"}
          </span>
          <button
            type="button"
            aria-label="Settings"
            onClick={() => openSettings().catch(console.error)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-3.5" />
          </button>
        </div>
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm exec vitest run src/tests/TrayPopover.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TrayPopover.tsx src/tests/TrayPopover.test.tsx
git commit -m "feat: add Settings gear icon to the popover"
```

---

### Task 12: `src/hooks/useCaptures.ts` — history retention pruning

**Files:**
- Create: `src/lib/retention.ts`
- Create: `src/tests/retention.test.ts`
- Modify: `src/hooks/useCaptures.ts`
- Create: `src/tests/useCaptures.test.ts`
- Modify: `src/components/TrayPopover.tsx` (pass retention through)

**Interfaces:**
- Consumes: `getSettings` (Task 6).
- Produces: `retentionCutoff(days: number, now?: Date) -> string`, used by `useCaptures.ts`. `useCaptures({ autoLoad?, retentionDays? })` gains the `retentionDays: number | null` option; `refresh()` prunes before selecting when it's set.

- [ ] **Step 1: Write the failing test for the cutoff computation**

The retention day-count needs converting to a cutoff timestamp before it can go in a `WHERE created_at < ?` clause. That's genuine pure logic worth its own test, separate from the hook's wiring — pulling it into its own module keeps it directly, precisely testable (exact output for a fixed `now`) instead of only checking "some string was passed" from inside a hook test.

Create `src/tests/retention.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { retentionCutoff } from "../lib/retention";

describe("retentionCutoff", () => {
  it("subtracts the given number of days from now", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    expect(retentionCutoff(30, now)).toBe("2026-06-22T12:00:00.000Z");
  });

  it("handles a single day", () => {
    const now = new Date("2026-07-22T00:00:00.000Z");
    expect(retentionCutoff(1, now)).toBe("2026-07-21T00:00:00.000Z");
  });

  it("defaults to the current time when now is omitted", () => {
    const before = Date.now();
    const cutoff = new Date(retentionCutoff(0)).getTime();
    const after = Date.now();
    expect(cutoff).toBeGreaterThanOrEqual(before);
    expect(cutoff).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm exec vitest run src/tests/retention.test.ts`
Expected: FAIL — cannot find module `../lib/retention`.

- [ ] **Step 3: Implement `retentionCutoff`**

Create `src/lib/retention.ts`:

```ts
/**
 * ISO-8601 cutoff timestamp: `days` days before `now` (defaults to the
 * current time). Captures with `created_at` earlier than this get pruned.
 */
export function retentionCutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm exec vitest run src/tests/retention.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/retention.ts src/tests/retention.test.ts
git commit -m "feat: add retention cutoff computation"
```

- [ ] **Step 6: Write the failing tests for the hook's pruning wiring**

Create `src/tests/useCaptures.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { selectMock, executeMock } = vi.hoisted(() => ({
  selectMock: vi.fn().mockResolvedValue([]),
  executeMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn().mockResolvedValue({ select: selectMock, execute: executeMock }),
  },
}));

import { useCaptures } from "../hooks/useCaptures";

describe("useCaptures retention", () => {
  beforeEach(() => {
    selectMock.mockClear();
    executeMock.mockClear();
  });

  it("does not prune when retentionDays is null", async () => {
    const { result } = renderHook(() =>
      useCaptures({ autoLoad: false, retentionDays: null })
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(executeMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalled();
  });

  it("prunes captures older than retentionDays before selecting", async () => {
    const { result } = renderHook(() =>
      useCaptures({ autoLoad: false, retentionDays: 30 })
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(executeMock).toHaveBeenCalledWith(
      "DELETE FROM captures WHERE created_at < ?",
      [expect.any(String)]
    );
    // Pruning must run before the select that follows it.
    const deleteOrder = executeMock.mock.invocationCallOrder[0];
    const selectOrder = selectMock.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(selectOrder);
  });
});
```

- [ ] **Step 7: Run the tests and confirm they fail**

Run: `pnpm exec vitest run src/tests/useCaptures.test.ts`
Expected: FAIL — `useCaptures` doesn't accept a `retentionDays` option, so `executeMock` is never called in the pruning test, and the first assertion in that test fails.

- [ ] **Step 8: Implement retention pruning**

Replace the contents of `src/hooks/useCaptures.ts` with:

```ts
import { useState, useEffect, useCallback } from "react";
import Database from "@tauri-apps/plugin-sql";
import { retentionCutoff } from "../lib/retention";
import type { Capture } from "../types";

interface UseCapturesOptions {
  /** `autoLoad` controls whether history is fetched. The capture overlay only
   * needs to INSERT, so it passes false to skip the SELECT-500 on mount. */
  autoLoad?: boolean;
  /** Prune captures older than this many days before every refresh. `null`
   * (or omitted) keeps everything — no pruning. */
  retentionDays?: number | null;
}

export function useCaptures({ autoLoad = true, retentionDays = null }: UseCapturesOptions = {}) {
  const [captures, setCaptures] = useState<Capture[]>([]);

  const refresh = useCallback(async () => {
    const db = await Database.load("sqlite:beaver.db");
    if (retentionDays != null) {
      await db.execute("DELETE FROM captures WHERE created_at < ?", [retentionCutoff(retentionDays)]);
    }
    const rows = await db.select<Capture[]>(
      "SELECT * FROM captures ORDER BY created_at DESC LIMIT 500"
    );
    setCaptures(rows);
  }, [retentionDays]);

  const saveCapture = useCallback(
    async (capture: Omit<Capture, "id" | "created_at">) => {
      const db = await Database.load("sqlite:beaver.db");
      await db.execute(
        `INSERT INTO captures (id, created_at, content, content_type, char_count, app_context)
         VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          capture.content,
          capture.content_type,
          capture.char_count,
          capture.app_context ?? null,
        ]
      );
      if (autoLoad) await refresh();
    },
    [autoLoad, refresh]
  );

  useEffect(() => {
    if (autoLoad) refresh();
  }, [autoLoad, refresh]);

  return { captures, refresh, saveCapture };
}
```

- [ ] **Step 9: Run the tests and confirm they pass**

Run: `pnpm exec vitest run src/tests/useCaptures.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 10: Wire retention through from settings in `TrayPopover`**

In `src/components/TrayPopover.tsx`, two import lines need updating — both are edits to lines Task 11 touched, not new lines:

- The existing `import { useEffect } from "react";` line becomes `import { useEffect, useState } from "react";`.
- The `import { openSettings } from "../lib/api";` line Task 11 added becomes `import { getSettings, openSettings } from "../lib/api";`.

Resulting import block:

```tsx
import { useEffect, useState } from "react";
import { getSettings, openSettings } from "../lib/api";
```

Change the top of the component from:

```tsx
export function TrayPopover() {
  const { captures, refresh } = useCaptures();
```

to:

```tsx
export function TrayPopover() {
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const { captures, refresh } = useCaptures({ retentionDays });

  useEffect(() => {
    getSettings()
      .then(s => setRetentionDays(s.history_retention_days))
      .catch(console.error);
  }, []);
```

- [ ] **Step 11: Run the full frontend test suite**

Run: `pnpm test:run`
Expected: all tests pass, including the pre-existing `TrayPopover` behavior and every test added in Tasks 6–12.

- [ ] **Step 12: Commit**

```bash
git add src/hooks/useCaptures.ts src/tests/useCaptures.test.ts src/components/TrayPopover.tsx
git commit -m "feat: prune capture history by retention setting"
```

---

## Manual verification (after all tasks)

Automated tests cover every pure function and every frontend component in isolation, but three things only a running app can confirm (per Tasks 2, 3, and 5's noted gaps):

1. **Full check:** `cd src-tauri && cargo test && cargo build`, then `pnpm test:run` and `pnpm build` from the repo root — everything should be green.
2. **Run the app** (`pnpm tauri dev`): open Settings from the popover gear icon and from the tray right-click menu; confirm both open the same singleton window.
3. **Shortcut round-trip:** record a new shortcut in Settings, close the window, confirm the *new* combo opens the capture overlay and the *old* one (`Cmd+Shift+D`) no longer does.
4. **Format/retention/update-toggle:** change the default format and confirm a fresh capture uses it; set retention to 30 days, confirm old captures (if any test data predates that window) disappear from history on next popover open; toggle updates off and confirm the update pill stops appearing even when a newer release exists.
5. **Corrupt-file resilience:** manually corrupt `~/Library/Application Support/se.djtl.beaver/settings.json` (or delete it) and relaunch — the app should start normally with defaults, not crash.
