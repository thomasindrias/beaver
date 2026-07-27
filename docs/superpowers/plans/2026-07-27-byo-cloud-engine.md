# BYO Cloud Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users run extraction against their own cloud provider via an API key stored in the macOS Keychain, with a real Settings picker and a per-capture engine indicator, per `docs/superpowers/specs/2026-07-27-byo-cloud-engine-design.md`.

**Architecture:** One hand-rolled OpenAI-compatible request path (no multi-provider crate), reusing `llamacpp.rs`'s request/response shape with a configurable base URL, model, and `Authorization: Bearer` header. A runtime `Engine` enum layers over the existing compile-time `cfg(target_arch)` local selection: local keeps its full five-part lifecycle untouched, cloud implements only `extract_from_image`. A pure `engine::select()` decides which runs, so the branch that determines whether a capture leaves the machine is directly unit-testable.

**Tech Stack:** Rust (Tauri 2, `reqwest` 0.12, `security-framework` 3 — already a transitive dep, promoted to direct), React 19 + TypeScript, Vitest + Testing Library.

## Global Constraints

- **The API key is never written to `settings.json`.** It lives only in the macOS Keychain, via `keychain.rs`, which is the only module permitted to touch Security.framework.
- **No command ever returns the key to the frontend.** `has_cloud_api_key` returns a `bool`. The Settings UI shows only whether a key is stored, never its value.
- **The key must never appear in an error string, a log line, or the HUD.** Error messages are constructed from HTTP status codes alone; provider error bodies are not forwarded.
- **`security-framework` verified API** (checked empirically against 3.7.0): `set_generic_password(service, account, &[u8])`, `get_generic_password(service, account) -> Result<Vec<u8>>`, `delete_generic_password(service, account)`. The getter is `get_generic_password`, **not** `generic_password`. No feature flag. A missing item is `Err` with `.code() == -25300` (`errSecItemNotFound`).
- **Local remains the default** and the fallback whenever cloud is not fully configured. A corrupt `settings.json` falls back to defaults, which means Local — a corrupt file can never silently route captures to the cloud.
- **A cloud failure is an error, not a fallback.** No silent local retry.
- Struct fields stay snake_case end to end (Rust ↔ JSON ↔ TypeScript), matching the existing `Settings`/`Capture` convention. `EngineKind` serializes lowercase (`"local"` / `"cloud"`), matching `ExtractFormat`.
- All frontend/backend IPC goes through `src-tauri/src/commands.rs` and its typed mirror `src/lib/api.ts`. No direct `invoke()` from components.
- **Verify with unfiltered output.** Run `cargo test` and `pnpm test:run` and read all of it. Never pipe a suite through `grep`/`head` to summarize a pass — a previous plan in this repo did that and concealed a bug that made an entire suite vacuous.
- TDD throughout: write the failing test, run it and watch it fail, implement the minimum to pass, run again, commit. Where something is genuinely untestable at the unit level (Tauri commands needing a live `AppHandle`), this plan says so explicitly, matching the existing convention in `server.rs`/`windows.rs`.
- YAGNI: no presets library, no local model picker, no streaming, no model discovery, no usage/cost tracking, no multiple stored keys, no per-capture engine override, no history engine column.

---

### Task 1: `keychain.rs` — Keychain-backed API key storage

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `security-framework`)
- Create: `src-tauri/src/keychain.rs`
- Modify: `src-tauri/src/lib.rs:6-16` (add `mod keychain;`)

**Interfaces:**
- Produces: `keychain::set_api_key(key: &str) -> Result<(), String>`, `keychain::api_key() -> Result<Option<String>, String>`, `keychain::delete_api_key() -> Result<(), String>`. Consumed by Task 4 (`commands.rs`).

- [ ] **Step 1: Add the dependency**

In `src-tauri/Cargo.toml`, add to the `[dependencies]` section after `fs4 = "0.13"`:

```toml
security-framework = "3"
```

Verify it resolves without adding new crates to the lock file (it is already present transitively):

```bash
cd src-tauri && cargo tree -p security-framework --depth 0
```

Expected: a line naming `security-framework v3.x.y`.

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/keychain.rs` containing ONLY the test module for now, so the tests fail to compile against missing functions:

```rust
//! macOS Keychain storage for the BYO-cloud API key. The only module in the
//! codebase that touches Security.framework.
//!
//! The key is deliberately never written to `settings.json`: that file lives
//! in the app-data dir in plaintext and is swept up by Time Machine and any
//! backup tool. It is also never returned to the frontend — `commands.rs`
//! exposes only a boolean "is one stored".

#[cfg(test)]
mod tests {
    use super::*;

    // A test-only service name so a developer's real Beaver key is never
    // read, overwritten, or deleted by the suite.
    const TEST_SERVICE: &str = "se.djtl.beaver.test";

    #[test]
    fn is_not_found_recognizes_err_sec_item_not_found() {
        assert!(is_not_found(-25300));
    }

    #[test]
    fn is_not_found_rejects_other_codes() {
        assert!(!is_not_found(0));
        assert!(!is_not_found(-25293));
    }

    #[test]
    fn set_then_get_round_trips_the_key() {
        let account = "roundtrip";
        let _ = delete_for(TEST_SERVICE, account);
        set_for(TEST_SERVICE, account, "sk-test-abc123").unwrap();
        assert_eq!(get_for(TEST_SERVICE, account).unwrap(), Some("sk-test-abc123".to_string()));
        delete_for(TEST_SERVICE, account).unwrap();
    }

    #[test]
    fn get_returns_none_when_no_key_is_stored() {
        let account = "absent";
        let _ = delete_for(TEST_SERVICE, account);
        assert_eq!(get_for(TEST_SERVICE, account).unwrap(), None);
    }

    #[test]
    fn delete_is_ok_when_no_key_is_stored() {
        let account = "delete-absent";
        let _ = delete_for(TEST_SERVICE, account);
        assert!(delete_for(TEST_SERVICE, account).is_ok());
    }

    #[test]
    fn set_overwrites_an_existing_key() {
        let account = "overwrite";
        let _ = delete_for(TEST_SERVICE, account);
        set_for(TEST_SERVICE, account, "sk-first").unwrap();
        set_for(TEST_SERVICE, account, "sk-second").unwrap();
        assert_eq!(get_for(TEST_SERVICE, account).unwrap(), Some("sk-second".to_string()));
        delete_for(TEST_SERVICE, account).unwrap();
    }
}
```

Add `mod keychain;` to `src-tauri/src/lib.rs`'s module list (alphabetically, between `mod engine;` and `mod permission;`).

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test keychain 2>&1`

Expected: compile errors — `cannot find function 'is_not_found'`, `'delete_for'`, `'set_for'`, `'get_for'` in this scope.

- [ ] **Step 4: Implement the module**

In `src-tauri/src/keychain.rs`, insert this above the `#[cfg(test)] mod tests` block (below the module doc comment):

```rust
use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};

const SERVICE: &str = "se.djtl.beaver";
const ACCOUNT: &str = "cloud-api-key";

/// macOS `errSecItemNotFound`. A missing keychain item means "no key
/// configured", which is a normal state rather than a failure, so it maps to
/// `Ok(None)` / `Ok(())` instead of an error.
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

fn is_not_found(code: i32) -> bool {
    code == ERR_SEC_ITEM_NOT_FOUND
}

// The `*_for` functions take the service and account explicitly so tests can
// drive a scratch identity, mirroring the pure/impure split settings.rs uses
// for `load_from`/`load`. Error strings never include the key value.

fn set_for(service: &str, account: &str, key: &str) -> Result<(), String> {
    set_generic_password(service, account, key.as_bytes())
        .map_err(|e| format!("failed to store the API key in the keychain: {e}"))
}

fn get_for(service: &str, account: &str) -> Result<Option<String>, String> {
    match get_generic_password(service, account) {
        Ok(bytes) => String::from_utf8(bytes)
            .map(Some)
            .map_err(|_| "the stored API key is not valid UTF-8".to_string()),
        Err(e) if is_not_found(e.code()) => Ok(None),
        Err(e) => Err(format!("failed to read the API key from the keychain: {e}")),
    }
}

fn delete_for(service: &str, account: &str) -> Result<(), String> {
    match delete_generic_password(service, account) {
        Ok(()) => Ok(()),
        Err(e) if is_not_found(e.code()) => Ok(()),
        Err(e) => Err(format!("failed to delete the API key from the keychain: {e}")),
    }
}

pub fn set_api_key(key: &str) -> Result<(), String> {
    set_for(SERVICE, ACCOUNT, key)
}

pub fn api_key() -> Result<Option<String>, String> {
    get_for(SERVICE, ACCOUNT)
}

pub fn delete_api_key() -> Result<(), String> {
    delete_for(SERVICE, ACCOUNT)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test keychain 2>&1`

Expected: 6 tests passing. They touch the real OS keychain but run unattended — a process reading an item it created itself gets no access prompt.

- [ ] **Step 6: Confirm the test suite left no scratch entries behind**

Run:

```bash
security find-generic-password -s "se.djtl.beaver.test" 2>&1 | head -1
```

Expected: `security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.`

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/keychain.rs src-tauri/src/lib.rs
git commit -m "feat: store the BYO-cloud API key in the macOS Keychain"
```

---

### Task 2: `engine/cloud.rs` — the OpenAI-compatible cloud client

**Files:**
- Create: `src-tauri/src/engine/cloud.rs`
- Modify: `src-tauri/src/engine/mod.rs:14-22` (add `pub mod cloud;`)

**Interfaces:**
- Produces: `cloud::Config { base_url: String, model: String, api_key: String }` (public fields, hand-written redacting `Debug`), `cloud::chat_completions_url(base_url: &str) -> String`, `cloud::extract_from_image(cfg: &Config, image_base64: &str, prompt: &str) -> Result<String, String>`. Consumed by Task 3 (`engine::Engine`).

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/engine/cloud.rs` containing ONLY the doc comment and test module:

```rust
//! BYO-cloud backend: any OpenAI-compatible `/v1/chat/completions` endpoint,
//! reached over HTTPS with a user-supplied base URL, model, and API key.
//!
//! Unlike the local backends this owns no lifecycle — there is no process to
//! spawn, nothing to provision, no port, and no health to poll. It implements
//! only `extract_from_image`, which is the single operation that varies
//! between engines at capture time.
//!
//! The request shape is deliberately identical to `llamacpp.rs`'s, since both
//! speak the same OpenAI-compatible schema; the differences are a configurable
//! model, an absolute URL instead of a localhost port, and a bearer token.

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> Config {
        Config {
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
            api_key: "sk-secret-do-not-leak".to_string(),
        }
    }

    #[test]
    fn chat_completions_url_appends_the_path() {
        assert_eq!(
            chat_completions_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn chat_completions_url_tolerates_a_trailing_slash() {
        // Gemini documents its base URL with a trailing slash; OpenAI without.
        assert_eq!(
            chat_completions_url("https://generativelanguage.googleapis.com/v1beta/openai/"),
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        );
    }

    #[test]
    fn chat_completions_url_collapses_repeated_trailing_slashes() {
        assert_eq!(
            chat_completions_url("https://example.com/v1///"),
            "https://example.com/v1/chat/completions"
        );
    }

    #[test]
    fn build_request_shapes_image_and_text_content_parts() {
        let req = build_request("gpt-4o-mini", "QUJD", "Extract as Markdown.");
        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["messages"][0]["content"][0]["type"], "image_url");
        assert_eq!(
            json["messages"][0]["content"][0]["image_url"]["url"],
            "data:image/png;base64,QUJD"
        );
        assert_eq!(json["messages"][0]["content"][1]["type"], "text");
        assert_eq!(json["messages"][0]["content"][1]["text"], "Extract as Markdown.");
    }

    #[test]
    fn build_request_uses_the_configured_model() {
        let req = build_request("claude-haiku-4-5-20251001", "QUJD", "p");
        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["model"], "claude-haiku-4-5-20251001");
    }

    #[test]
    fn map_error_status_reports_a_rejected_key() {
        assert_eq!(map_error_status(401), "Provider rejected the API key");
        assert_eq!(map_error_status(403), "Provider rejected the API key");
    }

    #[test]
    fn map_error_status_reports_rate_limiting() {
        assert_eq!(map_error_status(429), "Provider rate limit reached");
    }

    #[test]
    fn map_error_status_reports_provider_outages() {
        assert_eq!(map_error_status(500), "Provider is unavailable");
        assert_eq!(map_error_status(503), "Provider is unavailable");
    }

    #[test]
    fn map_error_status_falls_back_to_the_status_code() {
        assert_eq!(map_error_status(404), "Provider error (HTTP 404)");
    }

    #[test]
    fn chat_response_extracts_the_first_choice() {
        let raw = r#"{"choices":[{"message":{"content":" | a | b |\n"}}]}"#;
        let parsed: ChatResponse = serde_json::from_str(raw).unwrap();
        assert_eq!(first_choice(parsed).unwrap(), "| a | b |");
    }

    #[test]
    fn first_choice_errors_on_an_empty_choices_array() {
        let parsed: ChatResponse = serde_json::from_str(r#"{"choices":[]}"#).unwrap();
        assert_eq!(
            first_choice(parsed).unwrap_err(),
            "Provider returned an empty response"
        );
    }

    // The API key reaches this struct, so anything that formats it is a leak
    // vector: a stray `log::debug!("{cfg:?}")` would put the key in the log
    // file. Debug is hand-written to redact it.
    #[test]
    fn debug_redacts_the_api_key() {
        let rendered = format!("{:?}", cfg());
        assert!(!rendered.contains("sk-secret-do-not-leak"), "key leaked: {rendered}");
        assert!(rendered.contains("<redacted>"));
        assert!(rendered.contains("gpt-4o-mini"));
    }
}
```

In `src-tauri/src/engine/mod.rs`, add below the existing `#[cfg]` module declarations (cloud is not hardware-bound, so it is never `cfg`-gated):

```rust
pub mod cloud;
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test cloud 2>&1`

Expected: compile errors — `cannot find type 'Config'`, `cannot find function 'chat_completions_url'`, `'build_request'`, `'map_error_status'`, `'first_choice'`, `cannot find type 'ChatResponse'`.

- [ ] **Step 3: Implement the module**

In `src-tauri/src/engine/cloud.rs`, insert above the `#[cfg(test)] mod tests` block:

```rust
use std::time::Duration;

/// Where to send a cloud extraction and how to authenticate it.
///
/// `Debug` is implemented by hand so the key cannot reach a log line through
/// an incidental `{:?}`.
pub struct Config {
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}

impl std::fmt::Debug for Config {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Config")
            .field("base_url", &self.base_url)
            .field("model", &self.model)
            .field("api_key", &"<redacted>")
            .finish()
    }
}

/// Join a user-supplied base URL with the chat-completions path. Providers are
/// inconsistent about the trailing slash — Gemini documents one, OpenAI does
/// not — so normalize rather than concatenate.
pub fn chat_completions_url(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

/// Map an HTTP status to a short, user-readable cause.
///
/// This takes only the status code: provider error bodies are deliberately not
/// forwarded, because some providers echo request context into them, and the
/// HUD is not a place to render a stranger's JSON. Taking no `Config` also
/// means the API key cannot reach a message from here by construction.
fn map_error_status(status: u16) -> String {
    match status {
        401 | 403 => "Provider rejected the API key".to_string(),
        429 => "Provider rate limit reached".to_string(),
        s if (500..600).contains(&s) => "Provider is unavailable".to_string(),
        s => format!("Provider error (HTTP {s})"),
    }
}

#[derive(serde::Serialize)]
struct ImageUrl {
    url: String,
}

#[derive(serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentPart {
    ImageUrl { image_url: ImageUrl },
    Text { text: String },
}

#[derive(serde::Serialize)]
struct ChatMessage {
    role: &'static str,
    content: Vec<ContentPart>,
}

#[derive(serde::Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    max_tokens: u32,
}

fn build_request(model: &str, image_base64: &str, prompt: &str) -> ChatRequest {
    ChatRequest {
        model: model.to_string(),
        messages: vec![ChatMessage {
            role: "user",
            content: vec![
                ContentPart::ImageUrl {
                    image_url: ImageUrl {
                        url: format!("data:image/png;base64,{image_base64}"),
                    },
                },
                ContentPart::Text {
                    text: prompt.to_string(),
                },
            ],
        }],
        max_tokens: 1024,
    }
}

#[derive(serde::Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(serde::Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(serde::Deserialize)]
struct ChoiceMessage {
    content: String,
}

fn first_choice(resp: ChatResponse) -> Result<String, String> {
    resp.choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .ok_or_else(|| "Provider returned an empty response".to_string())
}

/// POST `<base_url>/chat/completions`. Returns the extracted text, or a
/// user-readable error — the same `Result<String, String>` contract as
/// `local::extract_from_image`.
///
/// The 120s timeout is shorter than the local engine's 180s: a cloud round
/// trip that exceeds two minutes is a failure worth reporting rather than
/// waiting on.
pub async fn extract_from_image(
    cfg: &Config,
    image_base64: &str,
    prompt: &str,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let body = build_request(&cfg.model, image_base64, prompt);
    let resp = client
        .post(chat_completions_url(&cfg.base_url))
        .bearer_auth(&cfg.api_key)
        .json(&body)
        .send()
        .await
        // The transport error is intentionally not interpolated: a user may
        // paste a base URL carrying a secret in its query string, and reqwest's
        // Display includes the URL.
        .map_err(|_| "Couldn't reach the provider".to_string())?;
    if !resp.status().is_success() {
        return Err(map_error_status(resp.status().as_u16()));
    }
    let parsed: ChatResponse = resp
        .json()
        .await
        .map_err(|_| "Provider returned an unreadable response".to_string())?;
    first_choice(parsed)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test cloud 2>&1`

Expected: 12 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/engine/cloud.rs src-tauri/src/engine/mod.rs
git commit -m "feat: add the OpenAI-compatible cloud extraction backend"
```

---

### Task 3: `Engine` enum, `select()`, and the new settings fields

**Files:**
- Modify: `src-tauri/src/engine/mod.rs` (add `EngineKind`, `Engine`, `select`)
- Modify: `src-tauri/src/settings.rs:12-30` (three new fields + defaults)

**Interfaces:**
- Consumes: `cloud::Config`, `cloud::extract_from_image` from Task 2; `local::extract_from_image` (existing).
- Produces: `engine::EngineKind { Local, Cloud }` (Serialize + Deserialize, lowercase), `engine::Engine { Local { port: u16 }, Cloud(cloud::Config) }` with `kind(&self) -> EngineKind` and `async extract(&self, image_base64: &str, prompt: &str) -> Result<String, String>`, and `engine::select(settings: &Settings, key: Option<String>, port: u16) -> Engine`. `Settings` gains `engine: EngineKind`, `cloud_base_url: String`, `cloud_model: String`. All consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to the existing `#[cfg(test)] mod tests` block in `src-tauri/src/engine/mod.rs`:

```rust
    use crate::settings::Settings;

    fn cloud_settings() -> Settings {
        Settings {
            engine: EngineKind::Cloud,
            cloud_base_url: "https://api.openai.com/v1".to_string(),
            cloud_model: "gpt-4o-mini".to_string(),
            ..Settings::default()
        }
    }

    #[test]
    fn engine_kind_defaults_to_local() {
        assert_eq!(Settings::default().engine, EngineKind::Local);
    }

    #[test]
    fn engine_kind_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&EngineKind::Cloud).unwrap(), "\"cloud\"");
        assert_eq!(serde_json::to_string(&EngineKind::Local).unwrap(), "\"local\"");
    }

    #[test]
    fn select_returns_cloud_when_fully_configured() {
        let e = select(&cloud_settings(), Some("sk-abc".to_string()), 11500);
        assert_eq!(e.kind(), EngineKind::Cloud);
    }

    #[test]
    fn select_passes_the_configuration_through_to_cloud() {
        let e = select(&cloud_settings(), Some("sk-abc".to_string()), 11500);
        match e {
            Engine::Cloud(cfg) => {
                assert_eq!(cfg.base_url, "https://api.openai.com/v1");
                assert_eq!(cfg.model, "gpt-4o-mini");
                assert_eq!(cfg.api_key, "sk-abc");
            }
            Engine::Local { .. } => panic!("expected the cloud engine"),
        }
    }

    #[test]
    fn select_returns_local_when_the_setting_is_local() {
        // Even with a complete cloud configuration present, the setting wins.
        let s = Settings { engine: EngineKind::Local, ..cloud_settings() };
        assert_eq!(select(&s, Some("sk-abc".to_string()), 11500).kind(), EngineKind::Local);
    }

    #[test]
    fn select_falls_back_to_local_without_a_key() {
        assert_eq!(select(&cloud_settings(), None, 11500).kind(), EngineKind::Local);
    }

    #[test]
    fn select_falls_back_to_local_on_a_blank_key() {
        let e = select(&cloud_settings(), Some("   ".to_string()), 11500);
        assert_eq!(e.kind(), EngineKind::Local);
    }

    #[test]
    fn select_falls_back_to_local_on_a_blank_base_url() {
        let s = Settings { cloud_base_url: "  ".to_string(), ..cloud_settings() };
        assert_eq!(select(&s, Some("sk-abc".to_string()), 11500).kind(), EngineKind::Local);
    }

    #[test]
    fn select_falls_back_to_local_on_a_blank_model() {
        let s = Settings { cloud_model: String::new(), ..cloud_settings() };
        assert_eq!(select(&s, Some("sk-abc".to_string()), 11500).kind(), EngineKind::Local);
    }

    #[test]
    fn select_carries_the_port_into_the_local_engine() {
        match select(&Settings::default(), None, 12345) {
            Engine::Local { port } => assert_eq!(port, 12345),
            Engine::Cloud(_) => panic!("expected the local engine"),
        }
    }

    #[test]
    fn select_trims_whitespace_from_the_cloud_configuration() {
        let s = Settings {
            cloud_base_url: "  https://api.openai.com/v1  ".to_string(),
            cloud_model: "  gpt-4o-mini  ".to_string(),
            ..cloud_settings()
        };
        match select(&s, Some("sk-abc".to_string()), 11500) {
            Engine::Cloud(cfg) => {
                assert_eq!(cfg.base_url, "https://api.openai.com/v1");
                assert_eq!(cfg.model, "gpt-4o-mini");
            }
            Engine::Local { .. } => panic!("expected the cloud engine"),
        }
    }
```

Also append to `src-tauri/src/settings.rs`'s test module:

```rust
    #[test]
    fn load_from_defaults_engine_to_local_for_a_pre_cloud_settings_file() {
        let path = scratch_path("pre-cloud");
        std::fs::write(&path, br#"{"shortcut":"CmdOrCtrl+Shift+Z"}"#).unwrap();
        let settings = load_from(&path);
        assert_eq!(settings.engine, crate::engine::EngineKind::Local);
        assert_eq!(settings.cloud_base_url, "");
        assert_eq!(settings.cloud_model, "");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn save_then_load_round_trips_the_cloud_fields() {
        let path = scratch_path("cloud-roundtrip");
        let settings = Settings {
            engine: crate::engine::EngineKind::Cloud,
            cloud_base_url: "https://api.anthropic.com/v1".to_string(),
            cloud_model: "claude-haiku-4-5-20251001".to_string(),
            ..Settings::default()
        };
        save_to(&path, &settings).unwrap();
        assert_eq!(load_from(&path), settings);
        let _ = std::fs::remove_file(&path);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test 2>&1`

Expected: compile errors — `cannot find type 'EngineKind'`, `no field 'engine' on type 'Settings'`, `cannot find function 'select'`.

- [ ] **Step 3: Add the settings fields**

In `src-tauri/src/settings.rs`, change the struct and its `Default` impl to:

```rust
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub default_format: ExtractFormat,
    pub shortcut: String,
    pub history_retention_days: Option<u32>,
    pub update_check_enabled: bool,
    pub engine: crate::engine::EngineKind,
    /// Base URL of an OpenAI-compatible endpoint, e.g. `https://api.openai.com/v1`.
    /// Empty until the user configures cloud.
    pub cloud_base_url: String,
    pub cloud_model: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_format: ExtractFormat::Markdown,
            shortcut: crate::shortcut::CAPTURE_SHORTCUT.to_string(),
            history_retention_days: None,
            update_check_enabled: true,
            // Local is the default and the identity. Note this also means a
            // corrupt settings.json — which falls back to Default — can never
            // silently route captures to a cloud provider.
            engine: crate::engine::EngineKind::Local,
            cloud_base_url: String::new(),
            cloud_model: String::new(),
        }
    }
}
```

- [ ] **Step 4: Add the engine enum and selection**

In `src-tauri/src/engine/mod.rs`, insert after the `pub mod cloud;` declaration and before `ServerStatus`:

```rust
use crate::settings::Settings;

/// Which engine ran, or should run. Serialized lowercase to match
/// `ExtractFormat`'s convention on the IPC boundary.
#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum EngineKind {
    Local,
    Cloud,
}

/// A resolved engine, ready to run one extraction.
///
/// Only `extract` varies between the variants. Provisioning, process spawning,
/// and health polling are local-only concerns and stay in `local`, still
/// selected at compile time by target architecture.
pub enum Engine {
    Local { port: u16 },
    Cloud(cloud::Config),
}

impl Engine {
    pub fn kind(&self) -> EngineKind {
        match self {
            Engine::Local { .. } => EngineKind::Local,
            Engine::Cloud(_) => EngineKind::Cloud,
        }
    }

    pub async fn extract(&self, image_base64: &str, prompt: &str) -> Result<String, String> {
        match self {
            Engine::Local { port } => local::extract_from_image(*port, image_base64, prompt).await,
            Engine::Cloud(cfg) => cloud::extract_from_image(cfg, image_base64, prompt).await,
        }
    }
}

/// Decide which engine runs this capture.
///
/// This is the branch that determines whether a capture leaves the machine, so
/// it is a pure function with no I/O: the caller reads the settings and the
/// keychain, and this decides. Cloud requires *every* piece to be present —
/// the setting, a base URL, a model, and a key — and falls back to local
/// otherwise. `update_settings` refuses to persist an incomplete cloud
/// configuration, so that fallback is a safety net rather than a path users
/// reach.
pub fn select(settings: &Settings, key: Option<String>, port: u16) -> Engine {
    if settings.engine != EngineKind::Cloud {
        return Engine::Local { port };
    }
    let base_url = settings.cloud_base_url.trim();
    let model = settings.cloud_model.trim();
    let key = key.unwrap_or_default();
    if base_url.is_empty() || model.is_empty() || key.trim().is_empty() {
        return Engine::Local { port };
    }
    Engine::Cloud(cloud::Config {
        base_url: base_url.to_string(),
        model: model.to_string(),
        api_key: key,
    })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test 2>&1`

Expected: all tests pass, including the 11 new `select`/`EngineKind` tests and the 2 new settings tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/engine/mod.rs src-tauri/src/settings.rs
git commit -m "feat: choose between the local and cloud engines at runtime"
```

---

### Task 4: IPC surface — commands, validation, and the typed frontend mirror

**Files:**
- Modify: `src-tauri/src/commands.rs:18-54` (both extract commands), plus new commands and validation
- Modify: `src-tauri/src/lib.rs:144-160` (register the new commands)
- Modify: `src/lib/api.ts`
- Modify: `src/hooks/useBeaver.ts:92, 106` (adapt to the new return shape)
- Modify: `src/tests/api.test.ts`
- Modify: `src/tests/SettingsPanel.test.tsx:9-14` (`BASE_SETTINGS` needs the new fields)
- Modify: `src/tests/useBeaver.test.ts` (its mocks resolve plain strings and must now resolve `ExtractionResult`)

**Interfaces:**
- Consumes: `keychain::*` (Task 1), `engine::{select, Engine, EngineKind}` (Task 3).
- Produces: `commands::ExtractionResult { text: String, engine: EngineKind }`; commands `set_cloud_api_key`, `has_cloud_api_key`, `delete_cloud_api_key`; `commands::validate_cloud_settings(next: &Settings, has_key: bool) -> Result<(), String>`. On the TS side: `EngineKind`, `ExtractionResult`, `Settings` with three new fields, and `setCloudApiKey`/`hasCloudApiKey`/`deleteCloudApiKey`. Consumed by Tasks 5 and 6.

- [ ] **Step 1: Write the failing Rust test for the validation rule**

Append to `src-tauri/src/commands.rs`'s test module:

```rust
    use crate::engine::EngineKind;
    use crate::settings::Settings;

    fn cloud_settings() -> Settings {
        Settings {
            engine: EngineKind::Cloud,
            cloud_base_url: "https://api.openai.com/v1".to_string(),
            cloud_model: "gpt-4o-mini".to_string(),
            ..Settings::default()
        }
    }

    #[test]
    fn validate_accepts_a_complete_cloud_configuration() {
        assert!(validate_cloud_settings(&cloud_settings(), true).is_ok());
    }

    #[test]
    fn validate_ignores_cloud_fields_when_the_engine_is_local() {
        let s = Settings { engine: EngineKind::Local, ..Settings::default() };
        assert!(validate_cloud_settings(&s, false).is_ok());
    }

    #[test]
    fn validate_rejects_cloud_without_a_key() {
        let err = validate_cloud_settings(&cloud_settings(), false).unwrap_err();
        assert!(err.contains("API key"), "unexpected message: {err}");
    }

    #[test]
    fn validate_rejects_a_blank_base_url() {
        let s = Settings { cloud_base_url: "  ".to_string(), ..cloud_settings() };
        let err = validate_cloud_settings(&s, true).unwrap_err();
        assert!(err.contains("base URL"), "unexpected message: {err}");
    }

    #[test]
    fn validate_rejects_a_blank_model() {
        let s = Settings { cloud_model: String::new(), ..cloud_settings() };
        let err = validate_cloud_settings(&s, true).unwrap_err();
        assert!(err.contains("model"), "unexpected message: {err}");
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd src-tauri && cargo test commands 2>&1`

Expected: `cannot find function 'validate_cloud_settings' in this scope`.

- [ ] **Step 3: Implement the Rust side**

In `src-tauri/src/commands.rs`, add `keychain` to the `use crate::{...}` list on line 7. Then add the result type and engine resolution helper above `capture_and_extract`:

```rust
/// An extraction plus the engine that actually produced it. The frontend
/// cannot infer the engine from settings, because settings may change between
/// the capture and the render — the indicator must report what ran.
#[derive(serde::Serialize)]
pub struct ExtractionResult {
    pub text: String,
    pub engine: engine::EngineKind,
}

/// Read the settings and the keychain, then resolve the engine. A keychain
/// read failure is logged and treated as "no key", which degrades to local —
/// the safe direction.
fn resolve_engine(app: &tauri::AppHandle, port: u16) -> engine::Engine {
    let settings = settings::load(app);
    let key = keychain::api_key().unwrap_or_else(|e| {
        log::warn!("keychain read failed, falling back to the local engine: {e}");
        None
    });
    engine::select(&settings, key, port)
}
```

Replace the bodies of the two extract commands. `capture_and_extract` becomes:

```rust
#[tauri::command]
pub async fn capture_and_extract(
    app: tauri::AppHandle,
    region: capture::CaptureRegion,
    format: Option<prompts::ExtractFormat>,
    state: tauri::State<'_, server::EngineState>,
    last: tauri::State<'_, LastCapture>,
) -> Result<ExtractionResult, String> {
    if !permission::screen_capture_granted() {
        return Err(permission::PERMISSION_ERROR.to_string());
    }
    let port = state.port;
    let bytes = capture::capture_region(&region).map_err(|e| e.to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    *last.0.lock().unwrap() = Some(bytes);
    let default_format = settings::load(&app).default_format;
    let prompt = prompts::prompt_for(format.unwrap_or(default_format), None);
    let selected = resolve_engine(&app, port);
    let kind = selected.kind();
    let text = selected.extract(&image_base64, &prompt).await?;
    Ok(ExtractionResult { text, engine: kind })
}
```

`re_extract` gains an `app` parameter and the same shape:

```rust
#[tauri::command]
pub async fn re_extract(
    app: tauri::AppHandle,
    format: prompts::ExtractFormat,
    hint: Option<String>,
    state: tauri::State<'_, server::EngineState>,
    last: tauri::State<'_, LastCapture>,
) -> Result<ExtractionResult, String> {
    let bytes = last
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no-capture-cached".to_string())?;
    let image_base64 = STANDARD.encode(&bytes);
    let prompt = prompts::prompt_for(format, hint.as_deref());
    let selected = resolve_engine(&app, state.port);
    let kind = selected.kind();
    let text = selected.extract(&image_base64, &prompt).await?;
    Ok(ExtractionResult { text, engine: kind })
}
```

Add the three key commands and the validation function near `get_settings`:

```rust
#[tauri::command]
pub fn set_cloud_api_key(key: String) -> Result<(), String> {
    keychain::set_api_key(&key)
}

/// Whether a key is stored. Deliberately a boolean: the key itself is never
/// returned across the IPC boundary.
#[tauri::command]
pub fn has_cloud_api_key() -> bool {
    keychain::api_key().ok().flatten().is_some()
}

#[tauri::command]
pub fn delete_cloud_api_key() -> Result<(), String> {
    keychain::delete_api_key()
}

/// Refuse to persist a cloud engine that could not actually run. Pure so the
/// rule is unit-testable; `has_key` is supplied by the caller.
pub fn validate_cloud_settings(next: &settings::Settings, has_key: bool) -> Result<(), String> {
    if next.engine != engine::EngineKind::Cloud {
        return Ok(());
    }
    if next.cloud_base_url.trim().is_empty() {
        return Err("Cloud engine needs a base URL.".to_string());
    }
    if next.cloud_model.trim().is_empty() {
        return Err("Cloud engine needs a model.".to_string());
    }
    if !has_key {
        return Err("Cloud engine needs an API key. Save one first.".to_string());
    }
    Ok(())
}
```

Then call it first thing in `update_settings`, before the existing save:

```rust
#[tauri::command]
pub fn update_settings(
    app: tauri::AppHandle,
    next: settings::Settings,
) -> Result<settings::Settings, String> {
    validate_cloud_settings(&next, has_cloud_api_key())?;
    let current = settings::load(&app);
    settings::save(&app, &next).map_err(|e| e.to_string())?;
    if next.shortcut != current.shortcut {
        if let Err(e) = shortcut::apply(&app, &next.shortcut, Some(&current.shortcut)) {
            if let Err(rollback_err) = settings::save(&app, &current) {
                log::error!("failed to roll back settings after shortcut apply failure: {rollback_err}");
            }
            return Err(e);
        }
    }
    Ok(next)
}
```

Register the three new commands in `src-tauri/src/lib.rs`, after `commands::update_settings,`:

```rust
            commands::set_cloud_api_key,
            commands::has_cloud_api_key,
            commands::delete_cloud_api_key,
```

- [ ] **Step 4: Run the Rust tests**

Run: `cd src-tauri && cargo test 2>&1`

Expected: all pass, including the 5 new validation tests.

- [ ] **Step 5: Write the failing frontend tests**

In `src/tests/api.test.ts`, update both settings object literals to include the new fields, and add the new command assertions. Change the `getSettings` test's `settings` literal to:

```ts
    const settings = {
      default_format: "markdown" as const,
      shortcut: "CmdOrCtrl+Shift+D",
      history_retention_days: null,
      update_check_enabled: true,
      engine: "local" as const,
      cloud_base_url: "",
      cloud_model: "",
    };
```

and the `updateSettings` test's `next` literal to:

```ts
    const next = {
      default_format: "json" as const,
      shortcut: "CmdOrCtrl+Shift+X",
      history_retention_days: 30,
      update_check_enabled: false,
      engine: "cloud" as const,
      cloud_base_url: "https://api.openai.com/v1",
      cloud_model: "gpt-4o-mini",
    };
```

Add these tests before the final `it.each` block:

```ts
  it("captureAndExtract resolves to the text and the engine that ran", async () => {
    invokeMock.mockResolvedValue({ text: "| a | b |", engine: "cloud" });
    const result = await api.captureAndExtract(
      { x: 0, y: 0, width: 10, height: 10 },
      "markdown"
    );
    expect(result).toEqual({ text: "| a | b |", engine: "cloud" });
  });

  it("setCloudApiKey sends the key", async () => {
    await api.setCloudApiKey("sk-abc");
    expect(invokeMock).toHaveBeenCalledWith("set_cloud_api_key", { key: "sk-abc" });
  });

  it("deleteCloudApiKey takes no payload", async () => {
    await api.deleteCloudApiKey();
    expect(invokeMock).toHaveBeenCalledWith("delete_cloud_api_key");
  });

  it("hasCloudApiKey returns whether a key is stored, never the key", async () => {
    invokeMock.mockResolvedValue(true);
    await expect(api.hasCloudApiKey()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("has_cloud_api_key");
  });
```

In `src/tests/SettingsPanel.test.tsx`, extend `BASE_SETTINGS` (lines 9-14) to:

```tsx
const BASE_SETTINGS = {
  default_format: "markdown" as const,
  shortcut: "CmdOrCtrl+Shift+D",
  history_retention_days: null,
  update_check_enabled: true,
  engine: "local" as const,
  cloud_base_url: "",
  cloud_model: "",
};
```

**`src/tests/useBeaver.test.ts` must be updated in this same step, or every test in it breaks.** That file mocks `invoke` from `@tauri-apps/api/core` and resolves it to a plain **string**; once `capture_and_extract` returns an object, `result.text` is `undefined` everywhere. Add this helper directly below the `region` constant near the top of the file:

```ts
// capture_and_extract / re_extract resolve to an ExtractionResult, not a bare
// string. The engine defaults to local since these tests are about the capture
// lifecycle, not engine selection.
const extraction = (text: string, engine: "local" | "cloud" = "local") => ({ text, engine });
```

Then wrap each string-resolving mock. There are five, at lines 13, 41, 83, 161, and 194:

```ts
    invokeMock.mockReset().mockResolvedValue(extraction("## Extracted content"));
```
```ts
    invokeMock.mockResolvedValue(extraction("| a | b |\n|---|---|\n| 1 | 2 |"));
```
```ts
    invokeMock.mockClear().mockResolvedValue(extraction("a,b\n1,2"));
```
```ts
    invokeMock.mockResolvedValue(extraction("recovered"));
```
```ts
    invokeMock.mockResolvedValue(extraction("second result"));
```

Leave every `mockRejectedValue` / `mockRejectedValueOnce` alone — the error path is unchanged. One deferred-resolver declaration also carries a string type and must widen; in the "a response landing after dismiss" test, change:

```ts
    let resolveLate: (v: string) => void;
```

to:

```ts
    let resolveLate: (v: { text: string; engine: string }) => void;
```

and update its later call site to pass `extraction("...")` instead of a bare string.

Do not change any `write_to_clipboard` assertion: `finish` still receives the plain text, so `{ text: "## Extracted content" }` remains correct.

- [ ] **Step 6: Run the frontend tests to verify the new ones fail**

Run: `pnpm test:run 2>&1`

Expected: the four new `api.test.ts` tests fail (`api.setCloudApiKey is not a function`, and `captureAndExtract` resolving to `undefined`), and TypeScript flags the settings literals until `api.ts` is updated.

- [ ] **Step 7: Implement the TypeScript side**

In `src/lib/api.ts`, extend the `Settings` interface and add the new types and wrappers:

```ts
export type EngineKind = "local" | "cloud";

export interface Settings {
  default_format: ExtractFormat;
  shortcut: string;
  history_retention_days: number | null;
  update_check_enabled: boolean;
  engine: EngineKind;
  cloud_base_url: string;
  cloud_model: string;
}

/** An extraction plus the engine that actually produced it. */
export interface ExtractionResult {
  text: string;
  engine: EngineKind;
}
```

Change the two extraction wrappers' return types:

```ts
/** Capture a screen region and extract it. */
export const captureAndExtract = (region: CaptureRegion, format: ExtractFormat) =>
  invoke<ExtractionResult>("capture_and_extract", { region, format });

/** Re-run extraction on the last capture with a new format and optional hint. */
export const reExtract = (format: ExtractFormat, hint?: string) =>
  invoke<ExtractionResult>("re_extract", { format, hint: hint ?? null });
```

Add at the end of the file:

```ts
export const setCloudApiKey = (key: string) =>
  invoke<void>("set_cloud_api_key", { key });

/** Whether a key is stored. The key itself never crosses the IPC boundary. */
export const hasCloudApiKey = () => invoke<boolean>("has_cloud_api_key");

export const deleteCloudApiKey = () => invoke<void>("delete_cloud_api_key");
```

In `src/hooks/useBeaver.ts`, adapt the two call sites to the new shape. Line 92 becomes:

```ts
      const result = await captureAndExtract(region, "markdown");
      setFormat("markdown");
      await finish(result.text, gen);
```

and line 106 becomes:

```ts
      const result = await reExtractCommand(next, hint);
      await finish(result.text, gen);
```

(Task 5 adds the engine state; this step only keeps the build green.)

- [ ] **Step 8: Run both suites**

Run: `cd src-tauri && cargo test 2>&1` then `pnpm test:run 2>&1`

Expected: both fully green. Read the complete output of each.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src/lib/api.ts src/hooks/useBeaver.ts src/tests/api.test.ts src/tests/SettingsPanel.test.tsx
git commit -m "feat: return the engine that ran and expose key commands over IPC"
```

---

### Task 5: Per-capture engine indicator in the HUD

**Files:**
- Modify: `src/hooks/useBeaver.ts` (track and return `engine`)
- Modify: `src/components/CaptureHud.tsx:57-70` (new prop) and the expanded pill at `:261+`
- Modify: `src/App.tsx:31-42` (destructure `engine`) and `:88-102` (pass it through)
- Modify: `src/tests/useBeaver.test.ts`
- Modify: `src/tests/CaptureHud.test.tsx`

**Interfaces:**
- Consumes: `ExtractionResult`, `EngineKind` from Task 4.
- Produces: `useBeaver` returns `engine: EngineKind | null`; `CaptureHud` accepts `engine: EngineKind | null`. Nothing later consumes these.

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/CaptureHud.test.tsx`, inside the existing `describe("CaptureHud rendering", ...)` block. These follow the file's established conventions exactly: spread the existing `baseProps`, and expand the pill with `fireEvent.mouseEnter(screen.getByTestId("hud"))` the way the "reveals the chip row on hover" test already does. The root test id is `"hud"`, not `"capture-hud"`.

`baseProps` also needs `engine: "local" as const` added to it, since `engine` becomes a required prop.

```tsx
  it("shows the on-device indicator in the expanded state", () => {
    render(<CaptureHud {...baseProps} engine="local" />);
    fireEvent.mouseEnter(screen.getByTestId("hud"));
    expect(screen.getByTestId("engine-indicator")).toHaveAccessibleName(
      "On-device engine"
    );
  });

  it("shows the cloud indicator in the expanded state", () => {
    render(<CaptureHud {...baseProps} engine="cloud" />);
    fireEvent.mouseEnter(screen.getByTestId("hud"));
    expect(screen.getByTestId("engine-indicator")).toHaveAccessibleName("Cloud engine");
  });

  it("keeps the indicator out of the collapsed pill", () => {
    render(<CaptureHud {...baseProps} engine="cloud" />);
    expect(screen.getByText("Copied as table")).toBeInTheDocument();
    expect(screen.queryByTestId("engine-indicator")).not.toBeInTheDocument();
  });

  it("omits the indicator when no engine is known", () => {
    render(<CaptureHud {...baseProps} engine={null} />);
    fireEvent.mouseEnter(screen.getByTestId("hud"));
    expect(screen.queryByTestId("engine-indicator")).not.toBeInTheDocument();
  });
```

Append to `src/tests/useBeaver.test.ts`, inside its existing `describe("useBeaver", ...)` block. That file mocks `invoke` from `@tauri-apps/api/core` as `invokeMock` — there is no per-command mock — and Task 4 added the `extraction()` helper this uses:

```ts
  it("exposes the engine reported by the capture", async () => {
    invokeMock.mockResolvedValue(extraction("hello", "cloud"));
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.engine).toBe("cloud");
  });

  it("starts with no known engine before any capture", () => {
    const { result } = renderHook(() => useBeaver());
    expect(result.current.engine).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run 2>&1`

Expected: the CaptureHud tests fail because no `engine-indicator` element exists, and the useBeaver test fails because `result.current.engine` is `undefined`.

- [ ] **Step 3: Track the engine in `useBeaver`**

In `src/hooks/useBeaver.ts`, add the import and state, set it at both call sites, and return it.

Extend the type import on line 3 and add to the api import on line 2 (`type EngineKind`). Add after the `contentType` state on line 21:

```ts
  const [engine, setEngine] = useState<EngineKind | null>(null);
```

In `runCapture`, after awaiting the result:

```ts
      const result = await captureAndExtract(region, "markdown");
      setFormat("markdown");
      setEngine(result.engine);
      await finish(result.text, gen);
```

In `reExtract`:

```ts
      const result = await reExtractCommand(next, hint);
      setEngine(result.engine);
      await finish(result.text, gen);
```

And extend the return on line 117:

```ts
  return { state, errorKind, format, contentType, engine, runCapture, reExtract, retry, engage, dismiss };
```

- [ ] **Step 4: Render the indicator**

In `src/components/CaptureHud.tsx`, add to the `Props` interface after `format`:

```tsx
  engine: EngineKind | null;
```

Add `engine` to the destructured parameter list, and import the type from `../lib/api`.

In the expanded pill (the `state === "success" || state === "rerendering"` block that renders when `revealed`), insert this as the first child of the pill `div`, before the `{!inputOpen && (` fragment:

```tsx
          {engine && (
            <>
              <span
                data-testid="engine-indicator"
                role="img"
                aria-label={engine === "cloud" ? "Cloud engine" : "On-device engine"}
                className="flex h-6 w-6 select-none items-center justify-center text-[11px] leading-none"
              >
                {engine === "cloud" ? "☁️" : "🔒"}
              </span>
              <span className="mx-1 h-3.5 w-px bg-white/15" />
            </>
          )}
```

It sits outside the `!inputOpen` guard deliberately: the expanded pill should report which engine ran whether or not the hint input is open. The collapsed pill is untouched, so the default reflex gains no new visual weight — matching the roadmap's "the engine indicator appears only inside the expanded state."

In `src/App.tsx`, add `engine` to the `useBeaver` destructure (after `contentType`) and pass `engine={engine}` to `<CaptureHud>` after the `format` prop.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:run 2>&1`

Expected: fully green, including the five new tests.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBeaver.ts src/components/CaptureHud.tsx src/App.tsx src/tests/useBeaver.test.ts src/tests/CaptureHud.test.tsx
git commit -m "feat: show which engine ran in the expanded capture HUD"
```

---

### Task 6: The Settings engine picker

**Files:**
- Modify: `src/components/SettingsPanel.tsx:117-126` (replace the static Engine row)
- Modify: `src/tests/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `Settings` (with the three new fields), `setCloudApiKey`, `hasCloudApiKey`, `deleteCloudApiKey` from Task 4.
- Produces: nothing consumed by later tasks. This is the final task.

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/SettingsPanel.test.tsx`:

```tsx
  const CLOUD_SETTINGS = {
    ...BASE_SETTINGS,
    engine: "cloud" as const,
    cloud_base_url: "https://api.openai.com/v1",
    cloud_model: "gpt-4o-mini",
  };

  it("offers both engines with local selected by default", async () => {
    render(<SettingsPanel />);
    expect(
      await screen.findByRole("button", { name: "🔒 Local (on-device)" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "☁️ Cloud" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("hides the cloud fields while local is selected", async () => {
    render(<SettingsPanel />);
    await screen.findByRole("button", { name: "🔒 Local (on-device)" });
    expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("reveals the cloud fields once cloud is selected", async () => {
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    expect(await screen.findByLabelText("Base URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
  });

  it("a provider preset prefills the base URL and model", async () => {
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    fireEvent.click(await screen.findByRole("button", { name: "Anthropic" }));
    expect(await screen.findByLabelText("Base URL")).toHaveValue(
      "https://api.anthropic.com/v1"
    );
    expect(screen.getByLabelText("Model")).toHaveValue("claude-haiku-4-5-20251001");
  });

  it("saving a key calls set_cloud_api_key and never renders it back", async () => {
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    const field = await screen.findByLabelText("API key");
    fireEvent.change(field, { target: { value: "sk-secret-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_cloud_api_key", {
        key: "sk-secret-123",
      })
    );
    expect(await screen.findByText("Key stored")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
  });

  it("the API key field masks its input", async () => {
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    expect(await screen.findByLabelText("API key")).toHaveAttribute("type", "password");
  });

  it("surfaces a rejected cloud configuration and stays on local", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "has_cloud_api_key") return false;
      if (cmd === "update_settings") throw new Error("Cloud engine needs an API key. Save one first.");
      return undefined;
    });
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "☁️ Cloud" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use cloud engine" }));
    expect(
      await screen.findByText(/Cloud engine needs an API key/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "🔒 Local (on-device)" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("removing a stored key calls delete_cloud_api_key", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return CLOUD_SETTINGS;
      if (cmd === "has_cloud_api_key") return true;
      if (cmd === "update_settings") return CLOUD_SETTINGS;
      return undefined;
    });
    render(<SettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove key" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("delete_cloud_api_key")
    );
  });
```

Also extend the `beforeEach` mock so `has_cloud_api_key` resolves by default:

```tsx
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      if (cmd === "update_settings") return BASE_SETTINGS;
      if (cmd === "has_cloud_api_key") return false;
      return undefined;
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run 2>&1`

Expected: the eight new tests fail — the Engine buttons are currently `disabled` with different labels, and none of the cloud fields exist.

- [ ] **Step 3: Implement the picker**

In `src/components/SettingsPanel.tsx`, add the preset table below `RETENTION_OPTIONS`:

```tsx
// Presets only prefill the two fields below; nothing about the choice is
// persisted, which is what keeps "add a provider" a one-line change with no
// backend, no migration, and no new code path. Both fields stay editable, so a
// default that ages is a papercut rather than a break.
const CLOUD_PRESETS: { label: string; base_url: string; model: string }[] = [
  { label: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  {
    label: "Anthropic",
    base_url: "https://api.anthropic.com/v1",
    model: "claude-haiku-4-5-20251001",
  },
  {
    label: "Gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.6-flash",
  },
  { label: "Custom", base_url: "", model: "" },
];
```

Extend the imports from `../lib/api` with `deleteCloudApiKey`, `hasCloudApiKey`, `setCloudApiKey`.

Add state next to the existing hooks:

```tsx
  const [hasKey, setHasKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  // Local edits to the cloud fields. They are only committed to the backend
  // when the user actually switches the engine on, so a half-typed URL never
  // gets persisted.
  const [draft, setDraft] = useState({ base_url: "", model: "" });
```

Load the key flag alongside the settings and seed the draft:

```tsx
  useEffect(() => {
    getSettings()
      .then(s => {
        setSettings(s);
        setDraft({ base_url: s.cloud_base_url, model: s.cloud_model });
      })
      .catch(console.error);
    hasCloudApiKey().then(setHasKey).catch(console.error);
  }, []);
```

Replace the entire static `<Row label="Engine">` block (lines 117-126) with:

```tsx
      <Row label="Engine">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={settings.engine === "local" ? "default" : "outline"}
            aria-pressed={settings.engine === "local"}
            onClick={() => apply({ ...settings, engine: "local" })}
          >
            🔒 Local (on-device)
          </Button>
          <Button
            size="sm"
            variant={settings.engine === "cloud" ? "default" : "outline"}
            aria-pressed={settings.engine === "cloud"}
            onClick={() => setCloudOpen(true)}
          >
            ☁️ Cloud
          </Button>
        </div>
      </Row>

      {(cloudOpen || settings.engine === "cloud") && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <Row label="Provider">
            <div className="flex flex-wrap justify-end gap-1">
              {CLOUD_PRESETS.map(p => (
                <Button
                  key={p.label}
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft({ base_url: p.base_url, model: p.model })}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </Row>

          <Row label="Base URL">
            <input
              aria-label="Base URL"
              value={draft.base_url}
              placeholder="https://api.openai.com/v1"
              onChange={e => setDraft(d => ({ ...d, base_url: e.target.value }))}
              className="w-56 rounded-md border border-border bg-transparent px-2 py-1 text-xs"
            />
          </Row>

          <Row label="Model">
            <input
              aria-label="Model"
              value={draft.model}
              placeholder="gpt-4o-mini"
              onChange={e => setDraft(d => ({ ...d, model: e.target.value }))}
              className="w-56 rounded-md border border-border bg-transparent px-2 py-1 text-xs"
            />
          </Row>

          <Row label="API key">
            <div className="flex items-center gap-1">
              {hasKey && <span className="text-[11px] text-muted-foreground">Key stored</span>}
              <input
                aria-label="API key"
                type="password"
                value={keyDraft}
                placeholder={hasKey ? "Replace stored key" : "sk-..."}
                onChange={e => setKeyDraft(e.target.value)}
                className="w-40 rounded-md border border-border bg-transparent px-2 py-1 text-xs"
              />
              <Button size="sm" variant="outline" onClick={saveKey}>
                Save key
              </Button>
              {hasKey && (
                <Button size="sm" variant="outline" onClick={removeKey}>
                  Remove key
                </Button>
              )}
            </div>
          </Row>

          {settings.engine !== "cloud" && (
            <Row label="">
              <Button size="sm" onClick={enableCloud}>
                Use cloud engine
              </Button>
            </Row>
          )}
        </div>
      )}
```

Add `const [cloudOpen, setCloudOpen] = useState(false);` next to the other state, and these three handlers above the `return`:

```tsx
  const saveKey = useCallback(async () => {
    if (!keyDraft.trim()) return;
    try {
      await setCloudApiKey(keyDraft);
      setKeyDraft("");
      setHasKey(true);
      setShortcutError(null);
    } catch (e) {
      setShortcutError(e instanceof Error ? e.message : String(e));
    }
  }, [keyDraft]);

  const removeKey = useCallback(async () => {
    try {
      await deleteCloudApiKey();
      setHasKey(false);
    } catch (e) {
      setShortcutError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Commits the draft and flips the engine in one save, so the backend
  // validates the whole configuration together and a rejection leaves the
  // engine untouched.
  const enableCloud = useCallback(async () => {
    if (!settings) return;
    await apply({
      ...settings,
      engine: "cloud",
      cloud_base_url: draft.base_url,
      cloud_model: draft.model,
    });
  }, [settings, draft, apply]);
```

Rename the `shortcutError` state to `error` throughout the file, since it now carries cloud validation failures too, and render it once beneath the engine block rather than only inside the shortcut row. Keep the shortcut row's existing inline rendering behavior by reading the same `error` value.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run 2>&1`

Expected: fully green, including the eight new tests.

- [ ] **Step 5: Verify the whole suite and the Rust side together**

Run each and read the complete output:

```bash
cd src-tauri && cargo test 2>&1
```

```bash
pnpm test:run 2>&1
```

```bash
pnpm build 2>&1
```

Expected: all green; `pnpm build` confirms TypeScript has no unused-import or type errors from the refactor.

- [ ] **Step 6: Commit**

```bash
git add src/components/SettingsPanel.tsx src/tests/SettingsPanel.test.tsx
git commit -m "feat: add a working cloud engine picker to Settings"
```

---

## Self-Review

**Spec coverage.** Every spec component maps to a task: `keychain.rs` (Task 1), `engine/cloud.rs` (Task 2), `engine/mod.rs` + `settings.rs` (Task 3), `commands.rs` + `api.ts` (Task 4), `useBeaver` + `CaptureHud` (Task 5), `SettingsPanel` (Task 6). The spec's non-goals are honored — no presets library, no local model picker, no streaming, no model discovery, no cost tracking, no multiple keys, no per-capture override, no history migration.

**The spec's one open question is resolved** in Task 5 Step 4: the indicator renders as the first child of the expanded pill, outside the `!inputOpen` guard so it stays visible when the hint input opens, followed by the same hairline divider the format chips already use.

**Type consistency.** `EngineKind` is `Local`/`Cloud` in Rust and `"local"`/`"cloud"` in TypeScript, bridged by `#[serde(rename_all = "lowercase")]` and asserted by a test in Task 3. `ExtractionResult` uses `text`/`engine` on both sides, asserted in Task 4. `cloud::Config`'s fields (`base_url`, `model`, `api_key`) match `select`'s construction in Task 3 and `Settings`' snake_case fields.

**Ordering is build-green throughout.** Task 4 changes the IPC return type and adapts `useBeaver` in the same task so the build never breaks; Task 5 then layers the engine state on top. Task 4 also updates `BASE_SETTINGS` in `SettingsPanel.test.tsx`, which would otherwise fail to typecheck the moment `Settings` gains required fields, and rewrites `useBeaver.test.ts`'s string-resolving mocks, which would otherwise leave `result.text` undefined across that entire file.

**Test conventions were read from the real files, not assumed.** `CaptureHud.test.tsx` uses a shared `baseProps` object and `getByTestId("hud")` (not a `renderHud` helper, and not `"capture-hud"`); `useBeaver.test.ts` mocks `invoke` from `@tauri-apps/api/core` command-agnostically (not `../lib/api` per-function). Task 5's test code matches both. An earlier draft of this plan assumed helpers that do not exist and would have failed on contact.

**One thing the implementer should verify rather than trust:** `src/tests/App.test.tsx:81` resolves every command to `undefined`. If any App-level test path reaches a capture, `result.text` would throw. It most likely never triggers one, but Task 4's full-suite run is what confirms it; if it does break, fix it there with the same `extraction()` shape.

**Known deviation from the spec.** The spec describes `Config` without mentioning `Debug`. Task 2 adds a hand-written redacting `Debug` impl and a test proving the key does not appear in it, because the key reaching a `{:?}` in a future log line is a real leak vector the spec's "never logged" requirement implies but does not mechanically enforce.
