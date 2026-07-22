# Beaver Settings Screen — Design Spec

**Date:** 2026-07-22
**Status:** Approved (design); pending spec review before planning
**Author:** Thomas Indrias / Claude

---

## Problem

Beaver has no settings surface at all. The roadmap's Phase 2
(`docs/ROADMAP.md`) opens with: *"Beaver currently has no settings surface;
this phase creates it."* Today, the gear icon in the capture HUD
(`onOpenSettings` in `App.tsx`) actually opens macOS's own Screen Recording
pane — there is no in-app settings screen to route to. Several behaviors that
should be user-configurable are hardcoded: the capture shortcut
(`shortcut::CAPTURE_SHORTCUT`), the default output format
(`ExtractFormat::Markdown` in `commands::capture_and_extract`), history
retention (captures accumulate forever), and the update-check toggle (only
reachable via the `BEAVER_DISABLE_UPDATE_CHECK` env var, not a real setting).

This spec builds the first version of the Settings screen: a dedicated
window, a persisted settings file, and the first four real settings —
default output format, capture shortcut, history retention, and the
update-check toggle — plus a non-interactive stub for engine selection so
the screen has a slot ready for BYO cloud when that lands.

---

## Goals

- A working Settings window reachable from the popover and the tray menu.
- Four real, persisted settings: default format, capture shortcut, history
  retention, update-check toggle.
- A settings persistence layer readable synchronously from Rust at app
  `.setup()` time — required because the global shortcut must be registered
  before any window exists.
- Changing the shortcut or the default format takes effect immediately, with
  no restart.
- A non-interactive engine stub row that previews where BYO cloud will slot
  in later, without inventing a fake setting for something with only one
  valid value today.

## Non-Goals (explicit scope cuts)

- **No BYO cloud engine.** Provider selection, API key entry, Keychain
  storage, per-capture engine indicator (🔒/☁️) — all a separate design once
  BYO cloud itself is built. The engine row here is a static preview, not a
  working picker.
- **No presets library.** Table→CSV, invoice→JSON, translate, explain-error
  presets are a separate Phase 2 bullet with their own UI (a list, binding
  shortcuts per preset) — out of scope for this pass.
- **No local model-size picker.** Depends on BYO cloud's engine picker
  existing first; not applicable while there's one local engine per
  platform.
- **No settings sync/export/import.** A single local JSON file is
  sufficient; no cloud sync, no multi-device story.
- **No general-purpose key-value store.** `tauri-plugin-store` and a new
  SQLite table were both considered and rejected in favor of a small
  hand-rolled struct — see Architecture.

---

## Architecture

**A hand-rolled `Settings` struct persisted as JSON, not a plugin.** Two
alternatives were considered:

1. **`tauri-plugin-store`** — a first-party key-value JSON store, readable
   from both Rust and a parallel JS API. Rejected: it would give the
   frontend a second IPC path outside `src/lib/api.ts`, which the recent
   refactor (`docs/superpowers/plans/...restructure...`) deliberately made
   the single typed command surface (`api.test.ts` pins every command name
   to `commands.rs`). Also a new Cargo + npm dependency for what is a
   handful of scalar fields.
2. **A new table in the existing SQLite DB** (`tauri-plugin-sql`, already a
   dependency, already used for captures). Rejected: its Rust-side access is
   async and driven from JS `Database.load()` calls — there is no clean
   synchronous read at `.setup()` time, which is exactly what shortcut
   registration needs before any window opens.

The chosen shape — `src-tauri/src/settings.rs`, a `serde`-derived struct
written/read as JSON in `app_data_dir()` via blocking `std::fs`, following
the same pattern `server.rs` already uses for its setup marker file — needs
no new dependency, is trivially unit-testable (like `update.rs`'s
`merge_cache`), and is exposed to the frontend only through
`commands.rs`/`api.ts`.

```
src-tauri/src/settings.rs
  struct Settings { default_format, shortcut, history_retention_days, update_check_enabled }
  fn load(app) -> Settings       // defaults on missing/corrupt file
  fn save(app, &Settings) -> io::Result<()>

src-tauri/src/commands.rs
  get_settings(app) -> Settings
  update_settings(app, Settings) -> Result<Settings, String>
    // on shortcut change: shortcut::apply(app, new) first; only saves if that succeeds

src-tauri/src/shortcut.rs
  fn apply(app, &str) -> Result<(), Error>   // unregister old, register new; used by
                                               // both .setup() and update_settings
```

---

## Decisions locked during brainstorming

1. **Scope: core four settings + a static engine stub**, not the full Phase
   2 bullet (BYO cloud and presets are separate, later specs).
2. **Persistence: hand-rolled JSON via `std::fs`**, not `tauri-plugin-store`
   or a SQLite table — see Architecture.
3. **Window: a dedicated `"settings"` WebviewWindow** with a standard native
   title bar (not onboarding's borderless branded chrome — this is a utility
   window), fixed size, singleton show-or-build like the existing popover/
   onboarding windows. Reached from a gear icon in the popover header and a
   `"Settings…"` tray-menu item.
4. **History retention is time-based** (Keep forever / 30 days / 90 days),
   not count-based — matches how people think about history ("how far back
   can I search"), and needs no new DB migration since `created_at` is
   already indexed.
5. **Shortcut reconfiguration is a click-to-record field**, not a fixed
   preset dropdown — press the field, press the new combo, it captures and
   applies (with revert-on-conflict).

---

## Components

### 1. `src-tauri/src/settings.rs` (new)

```rust
#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub default_format: ExtractFormat,        // default: Markdown
    pub shortcut: String,                      // default: shortcut::CAPTURE_SHORTCUT
    pub history_retention_days: Option<u32>,   // default: None (keep forever)
    pub update_check_enabled: bool,             // default: true
}

pub fn load(app: &tauri::AppHandle) -> Settings;
pub fn save(app: &tauri::AppHandle, s: &Settings) -> std::io::Result<()>;
```

`#[serde(default)]` on the struct (and `Default` per field) means a
`settings.json` written by an older version still parses after a new field
is added — the new field just falls back to its default. A corrupt or
unparseable file logs a warning and falls back to `Settings::default()`
rather than failing startup.

### 2. `src-tauri/src/shortcut.rs` (extended)

Currently just the `CAPTURE_SHORTCUT` constant. Gains:

```rust
pub fn apply(app: &tauri::AppHandle, accelerator: &str) -> Result<(), Box<dyn std::error::Error>>
```

Unregisters whatever shortcut is currently bound (if any) and registers
`accelerator` with the existing `show_capture_overlay` handler. Called once
from `.setup()` with the loaded setting's shortcut (replacing today's
one-shot inline `CAPTURE_SHORTCUT.parse()` call), and again from
`update_settings` whenever the shortcut changes.

### 3. `src-tauri/src/commands.rs` (extended)

- `get_settings(app) -> Settings` — thin wrapper over `settings::load`.
- `update_settings(app, next: Settings) -> Result<Settings, String>` — if
  `next.shortcut != current.shortcut`, calls `shortcut::apply` first; on
  failure, returns `Err` without saving or touching the live registration
  (old shortcut and old persisted file both stay authoritative). On success,
  `settings::save` and return the new `Settings`.
- `commands::capture_and_extract`'s format fallback changes from the
  hardcoded `ExtractFormat::Markdown` to `settings::load(app).default_format`.
- `commands::check_for_update` reads `settings::load(app).update_check_enabled`
  and short-circuits to `Ok(None)` when disabled, before the existing 24h
  cache/network logic. `BEAVER_DISABLE_UPDATE_CHECK` still overrides
  everything underneath, unchanged.

### 4. `src-tauri/src/windows.rs` (extended)

`build_settings` / `show_settings`, modeled on `build_onboarding`: standard
title bar (`"Beaver Settings"`), fixed size (~480×420), centered, not
resizable, singleton (`show()` + `set_focus()` if it already exists).

### 5. `src-tauri/src/lib.rs` (wiring)

- `.setup()` calls `shortcut::apply(app, &settings::load(app).shortcut)`
  instead of the current inline parse-and-register.
- Tray menu (`MenuBuilder`) gains a `"Settings…"` item alongside the
  existing `"Quit Beaver"` item, calling `windows::show_settings`.
- `invoke_handler!` gains `commands::get_settings`, `commands::update_settings`,
  and a small `commands::open_settings` (called from the popover's gear icon).

### 6. `src/lib/routing.ts` (extended)

`View` gains `"settings"`. `selectView` checks
`windowLabel === "settings"` the same way it already checks `"onboarding"` —
the settings window loads `WebviewUrl::App("/")` like onboarding does, and
is distinguished purely by window label, not a route.

### 7. `src/components/SettingsPanel.tsx` (new)

Lazy-loaded in `App.tsx` alongside `TrayPopover`/`Onboarding`. Styled with
the same full-window tokens `Onboarding.tsx` uses (`bg-background
text-foreground`, shadcn `Button`) — not the translucent popover tokens,
since this is a normal opaque window. A single vertical list of labeled
rows, no tabs/sidebar:

- **Format** — 4-way segmented control (Markdown / CSV / JSON / Plain).
- **Shortcut** — a `Kbd`-styled click-to-record field. Click → next keydown
  is captured and translated to a Tauri accelerator string → `update_settings`.
  On rejection (OS-level conflict), the field reverts to the previous value
  and shows an inline error.
- **History** — three-option control (Keep forever / 30 days / 90 days).
- **Updates** — a plain on/off switch.
- **Engine** — static, non-interactive: `🔒 Local (on-device)` selected,
  `☁️ Cloud — coming soon` greyed out. Not backed by a persisted field.

### 8. `src/components/TrayPopover.tsx` (extended)

Gear icon added to the header, next to `UpdatePill`, calling
`openSettings()` from `api.ts`.

### 9. `src/hooks/useCaptures.ts` (extended)

`refresh()` gains an optional `retentionDays: number | null` parameter.
When set, runs `DELETE FROM captures WHERE created_at < ?` (cutoff computed
from `retentionDays`) immediately before the existing `SELECT`. `TrayPopover`
fetches `get_settings()` once and passes `historyRetentionDays` through —
pruning happens opportunistically on the popover's existing mount/focus
refresh cycle, no new timer or background job.

---

## Data Flow

1. **Startup:** `.setup()` calls `settings::load(app)`, uses the result's
   `shortcut` to register the global shortcut via `shortcut::apply`. Every
   other setting is read lazily by the command that needs it
   (`capture_and_extract`, `check_for_update`) rather than cached in memory,
   keeping `Settings` a plain on-disk source of truth with no separate
   in-memory-vs-disk sync problem to manage.
2. **Opening Settings:** gear icon or tray item → `windows::show_settings`
   → `SettingsPanel` mounts → calls `get_settings()` → renders current
   values.
3. **Changing a setting:** `SettingsPanel` calls `update_settings(next)`.
   Rust validates (shortcut path only), saves, and returns the accepted
   `Settings`. The panel always re-renders from that response rather than
   trusting the request it sent: on success the response simply echoes
   `next`, and on `Err` the field reverts to whatever `get_settings` last
   returned (the field's local "recording" state was only ever a preview,
   never committed) and shows an inline error.
4. **Popover history refresh:** on mount/focus, `TrayPopover` fetches
   `get_settings()`, passes `historyRetentionDays` into `useCaptures`'s
   `refresh()`, which prunes-then-selects.

---

## Error Handling

- **Missing/corrupt `settings.json`:** logged warning, falls back to
  `Settings::default()`, startup never blocked.
- **Shortcut registration failure** (combo already taken at the OS level):
  `update_settings` returns `Err` before saving or touching the live
  registration; old shortcut stays both registered and persisted; UI reverts
  the field and shows an inline message.
- **Settings file write failure** (disk full, permissions): same shape —
  `update_settings` returns `Err` before applying any runtime side effect,
  so persisted state and live state never diverge.
- **History prune query failure:** left unhandled, consistent with the
  existing (unhandled) error style throughout `useCaptures.ts` — not a new
  pattern introduced here.

---

## Testing

Test-first throughout, per the project's standing TDD/YAGNI rule.

- **`settings.rs`:** load-defaults-on-missing-file, load-defaults-on-corrupt-
  json, save/load round-trip, forward-compat (`#[serde(default)]` tolerates
  a JSON missing a field added later).
- **`shortcut.rs`:** unit tests for the parts that are pure (accelerator
  string shape), following the existing `CAPTURE_SHORTCUT` test style; actual
  OS-level registration stays untested at this layer, consistent with how
  window-building itself isn't unit-tested elsewhere in the codebase.
- **`commands.rs`:** any logic that can be pure (e.g. the retention
  cutoff-date computation) gets extracted into small testable functions,
  matching the existing `is_truthy`/`parse_tag`/`merge_cache` pattern —
  command wrappers themselves stay thin, like the rest of the file.
- **`SettingsPanel.test.tsx`** (new): renders all rows from `get_settings`;
  format selection calls `update_settings` and reflects the response;
  shortcut conflict (mocked rejection) reverts the field and shows an error;
  retention/update toggles call `update_settings` with the right payload.
- **`routing.test.ts`:** extend with a case for `windowLabel === "settings"`
  → `"settings"` view.
- **`useCaptures.test.ts`** (new — this hook has no existing test file):
  covers the retention-prune query, including the `retentionDays == null`
  (no pruning) case.

---

## Risks & Trade-offs

- **Settings read from disk on every command call** (no in-memory cache) —
  a deliberate simplicity trade-off: file reads are cheap and local, and
  caching would introduce an invalidation problem (keeping cache and disk in
  sync across the settings window and the command layer) that isn't worth
  solving for a file this small and this infrequently written.
- **Engine stub has no persisted state.** If BYO cloud's eventual design
  wants to remember an engine choice, that field gets added to `Settings`
  then, guarded by the same `#[serde(default)]` forward-compat this spec
  already establishes — no migration needed.
- **No settings validation beyond the shortcut path.** Format, retention,
  and the update toggle are all closed enums/booleans the UI can't produce
  invalid values for, so server-side validation for those specifically would
  be dead code today — cut per YAGNI.

---

## Open questions for the plan

- Exact accelerator-string capture/translation approach on the frontend
  (mapping a browser `KeyboardEvent` to Tauri's `CmdOrCtrl+Shift+D`-style
  syntax) — needs a concrete implementation choice, likely a small manual
  keycode-to-accelerator-token map since there's no existing dependency for
  this.
- Exact fixed pixel size for the Settings window — a placeholder (~480×420)
  is given here; the plan should size it to the actual five-row content.
- Whether the gear icon replaces or sits alongside the HUD's existing
  `onOpenSettings` (currently wired to macOS's Screen Recording pane) — that
  call site should probably now open the real Settings window instead,
  which the plan should confirm and wire up.
