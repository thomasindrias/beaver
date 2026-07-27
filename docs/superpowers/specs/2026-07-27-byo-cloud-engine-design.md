# BYO Cloud Engine — Design Spec

**Date:** 2026-07-27
**Status:** Approved (design); pending spec review before planning
**Author:** Thomas Indrias / Claude

---

## Problem

`docs/ROADMAP.md`'s Phase 2 commits to a BYO cloud engine: *"provider + API key
(stored in macOS Keychain), per-capture engine indicator, per-preset engine
choice. Local remains default."* The decided product principle is sharper:

> **Engine: local by default, BYO cloud opt-in.** On-device MLX stays the
> default and the identity. Users may add their own API key for a fast cloud
> model in Settings. Every capture visibly shows which engine ran
> (🔒 on-device / ☁️ provider). Cloud is never the silent default; the privacy
> claim becomes *"private by default, provable when local."*

Today the Settings screen ships a static, non-persisted Engine row
(`src/components/SettingsPanel.tsx:117-126`) with 🔒 Local selected and
☁️ Cloud greyed out as "coming soon" — an explicit placeholder for this work.
There is no cloud code path at all: `commands.rs` calls
`engine::local::extract_from_image` directly, and `engine/mod.rs` selects the
local backend at *compile time* via `#[cfg(target_arch)]`.

`engine/mod.rs`'s own doc comment anticipates exactly this feature:

> An engine that isn't hardware-bound (e.g. a BYO-cloud provider) would be a
> new sibling module chosen at runtime instead of here.

This spec builds that sibling module, the runtime choice on top of the existing
compile-time one, keychain-backed key storage, a real Settings picker, and the
per-capture engine indicator.

---

## Goals

- A working engine picker in Settings: Local or Cloud, persisted, taking effect
  on the next capture with no restart.
- Cloud extraction against any OpenAI-compatible chat-completions endpoint, with
  a user-supplied base URL, model, and API key.
- The API key stored in the macOS Keychain and never written to disk in
  plaintext.
- Every capture reports which engine actually ran, surfaced as 🔒 / ☁️ in the
  HUD's expanded state.
- Cloud failures produce a specific, actionable message in the HUD's existing
  error pill, with the existing retry chip.
- Local remains the default and the fallback whenever cloud is not fully
  configured.

## Non-Goals (explicit scope cuts)

- **No presets library.** The roadmap's "per-preset engine choice" depends on
  presets, which do not exist. Out of scope until they do.
- **No local model picker.** The Hugging Face downloadable-model work is a
  separate spec.
- **No streaming.** Beaver copies a finished result; a token stream has no
  surface to render into and would complicate the one-shot request shape.
- **No model discovery or listing.** Beaver does not call `/v1/models`. The
  model is a text field with a preset-supplied default.
- **No usage, cost, or token tracking.** The user's provider dashboard already
  does this, and a spend meter is not Beaver's job.
- **No multiple stored keys.** One key at a time (see Decisions).
- **No per-capture engine override.** The engine is a global setting. A
  per-capture toggle would put a decision in front of the reflex.
- **No engine column in capture history.** The roadmap asks for a *per-capture*
  indicator, which the HUD provides at capture time. Recording it in SQLite
  needs migration 3 and a slot in the popover's history rows that the design
  does not have. Deferred; the forward-compatible add is trivial later.
- **No native provider APIs.** Anthropic's `/v1/messages` and Gemini's
  `generateContent` are reached through their OpenAI-compatible endpoints
  instead (see Architecture).

---

## Architecture

### One request shape, not three

**Decision: a single hand-rolled OpenAI-compatible code path**, not a
multi-provider library and not per-provider native mappings.

Three alternatives were considered:

1. **A multi-provider crate** (`genai`, `litellm-rust`, `graniet/llm`,
   `octolib`). `genai` is genuinely active (`0.7.0-beta.14`, published
   2026-07-20, ~99k recent downloads) and supports OpenAI/Anthropic/Gemini
   vision natively. Rejected on four grounds: it is pre-1.0 and documents
   breaking changes between minor versions, which is poor footing for a signed
   desktop app whose every dependency bump means a fresh notarized release; it
   abstracts over *chat* (multi-turn, tools, streaming, agents) when Beaver's
   scope test is literally "would this be better in a chat window?"; it adds
   compile time and binary size; and it enlarges the audit surface behind
   Beaver's central privacy claim, where `CONTRIBUTING.md` requires that
   off-device network calls be explicit and user-controlled. Sixty lines of
   `reqwest` that a reader can verify sends one request to one user-configured
   URL is a stronger claim than a framework whose routing must be re-audited on
   every upgrade.
   `sobelio/llm-chain` was evaluated and rejected on facts: its last release
   was `0.13.0` on 2023-11-15, it has no Anthropic or Gemini support, and it
   predates multimodal input entirely.
2. **Per-provider native mappings** (OpenAI chat-completions, Anthropic
   `/v1/messages` with `x-api-key`, Gemini `generateContent`). No compat-layer
   dependency, but three request/response mappings and three test suites, and
   every additional provider (Groq, Together, Fireworks, OpenRouter, DeepSeek)
   needs its own code.
3. **The chosen path: one OpenAI-compatible mapping.** `llamacpp.rs` already
   talks to an OpenAI-compatible `/v1/chat/completions` endpoint with a
   base64 data-URI image, so the request and response structs are a direct
   reuse. One code path covers OpenAI, Groq, Together, Fireworks, OpenRouter,
   DeepSeek, xAI, and Mistral natively, and reaches Anthropic and Gemini
   through their documented OpenAI-compatible endpoints.

**On the compat endpoints.** Anthropic labels its OpenAI compatibility layer
"not considered a long-term or production-ready solution for most use cases."
That disclaimer was read in full before relying on it: it targets prompt
caching, extended thinking, citations, PDF support, and Structured Outputs.
Beaver uses none of them. Beaver sends one user message containing an
`image_url` part and a `text` part plus `max_tokens`, and reads
`choices[0].message.content`. Anthropic's compatibility table marks every one
of those "Fully supported", and states the layer "is intended to remain fully
functional and not have breaking changes." Gemini's compatibility endpoint
likewise supports image understanding; only native-format multimodal and
Gemini-specific features require its own SDK.

This is a deliberate, documented risk: if either provider degrades its compat
layer, the mitigation is to add a native mapping for that provider behind the
same `Engine::Cloud` arm, which is a contained change.

### Runtime selection on top of compile-time selection

The engine abstraction is **asymmetric**. Local has a five-part lifecycle —
`env_is_ready`, `build_env`, `spawn_server`, `health`, `extract_from_image` —
because it provisions an environment and supervises a child process. Cloud has
exactly one of those: there is no process, no port, no provisioning, no health
to poll. Only `extract_from_image` varies at capture time.

A `trait VisionEngine` with `Box<dyn>` was considered and rejected: async trait
objects need the `async-trait` crate (a new dependency) or awkward workarounds,
and the trait would either force cloud to stub four meaningless lifecycle
methods or split into two traits, which is the chosen design with extra
ceremony. A plain `if` at each call site was also rejected: it duplicates the
selection rule and key lookup across `capture_and_extract` and `re_extract`,
with nowhere to unit-test the rule.

The chosen shape keeps local's lifecycle exactly where it is (still
compile-time `cfg`-selected, untouched) and adds a small runtime enum over the
one operation that varies:

```
src-tauri/src/engine/mod.rs      (extended)
  pub enum EngineKind { Local, Cloud }        // serde: lowercase
  pub enum Engine { Local { port: u16 }, Cloud(cloud::Config) }
  pub fn select(settings: &Settings, key: Option<String>, port: u16) -> Engine
  impl Engine { pub fn kind(&self) -> EngineKind
                pub async fn extract(&self, image_base64: &str, prompt: &str)
                    -> Result<String, String> }

src-tauri/src/engine/cloud.rs    (new)
  pub struct Config { base_url: String, model: String, api_key: String }
  pub fn chat_completions_url(base_url: &str) -> String
  pub async fn extract_from_image(cfg: &Config, image_base64: &str, prompt: &str)
      -> Result<String, String>

src-tauri/src/keychain.rs        (new)
  pub fn set_api_key(key: &str) -> Result<(), String>
  pub fn api_key() -> Result<Option<String>, String>
  pub fn delete_api_key() -> Result<(), String>
```

`select` is pure, so the rule that decides whether a capture leaves the machine
is directly unit-testable — which is the single most privacy-critical branch in
this feature.

---

## Decisions locked during brainstorming

1. **One OpenAI-compatible request path**, not a library and not native
   per-provider mappings. Providers are reached by base URL. See Architecture.
2. **`security-framework` used directly** for keychain access, rather than the
   `keyring` crate. `security-framework` 3.7.0 is **already present in
   `Cargo.lock`** as a transitive dependency, so this adds zero new crates to
   the tree and only promotes an existing one to a direct dependency. It is
   macOS-only, which matches Beaver exactly; Windows/Linux are an explicitly
   unscheduled stretch goal in the engine matrix, and swapping in a
   cross-platform abstraction then is contained behind `keychain.rs`.
   `tauri-plugin-stronghold` was rejected because it is an encrypted vault
   requiring a user-supplied password to unlock, which a reflex tool cannot ask
   for on every launch. Plaintext in `settings.json` was rejected as
   contradicting the roadmap and the privacy positioning.
3. **A cloud failure is an error, not a fallback.** When cloud is selected and
   the request fails, the HUD shows its existing error pill with a specific
   cause and the retry chip. Beaver does not silently re-run on-device.
   Determinism is a stated durable differentiator: one transformation, the same
   way, every time. A silent fallback would also make the user wait out the
   cloud timeout before the local run even starts.
4. **One stored key, not one per provider.** `service = "se.djtl.beaver"`,
   `account = "cloud-api-key"`. Switching providers replaces the key. Keying by
   provider would cost little code but would make "which credential is active
   right now" have more than one answer, which is the wrong property for a
   secret.
5. **Presets are a frontend constant, not backend state.** Picking a provider
   prefills `cloud_base_url` and `cloud_model`; only those two values persist.
   Adding a provider is a one-line frontend change with no backend, no
   migration, and no new code path.
6. **Engine choice is global**, from Settings. No per-capture override.

---

## Components

### 1. `src-tauri/src/keychain.rs` (new)

Wraps `security_framework::passwords`. The only file in the codebase that
touches Security.framework.

```rust
const SERVICE: &str = "se.djtl.beaver";
const ACCOUNT: &str = "cloud-api-key";

pub fn set_api_key(key: &str) -> Result<(), String>;
pub fn api_key() -> Result<Option<String>, String>;   // Ok(None) if absent
pub fn delete_api_key() -> Result<(), String>;        // Ok(()) if absent
```

`errSecItemNotFound` maps to `Ok(None)` / `Ok(())` rather than an error: "no key
configured" is a normal state, not a failure. Every other OS error is returned
as a string. **No function in this module ever logs the key value.**

`Cargo.toml` gains `security-framework = "3"` as a direct dependency.

**The upstream API was verified empirically against `security-framework` 3.7.0
before this spec was finalized**, because the published module summary is
misleading about one name. The confirmed surface is:

```rust
use security_framework::passwords::{
    set_generic_password,     // (service: &str, account: &str, password: &[u8]) -> Result<()>
    get_generic_password,     // (service: &str, account: &str) -> Result<Vec<u8>>
    delete_generic_password,  // (service: &str, account: &str) -> Result<()>
};
```

The getter is `get_generic_password`, **not** `generic_password`. It takes and
returns **bytes**, so `keychain.rs` owns the UTF-8 conversion at the boundary.
No feature flag is required. A missing item returns `Err` whose `.code()` is
`-25300` (`errSecItemNotFound`), which is the value the `Ok(None)` mapping keys
off.

A probe binary performed a full set → get → delete → get round trip **without
producing any keychain access prompt**, because the process reading the item is
the same one that created it. This resolves the CI question: these tests can run
unattended and do not need `#[ignore]`.

### 2. `src-tauri/src/engine/cloud.rs` (new)

```rust
pub struct Config { pub base_url: String, pub model: String, pub api_key: String }
```

Request and response structs are the same shape `llamacpp.rs` already uses
(`ContentPart::ImageUrl` with a `data:image/png;base64,…` URL, plus
`ContentPart::Text`), with `model` taken from `Config` instead of a constant.
`max_tokens: 1024`, matching `llamacpp.rs`.

`chat_completions_url` is a small pure function because base URLs are
inconsistent in the wild: Gemini documents
`https://generativelanguage.googleapis.com/v1beta/openai/` **with** a trailing
slash, OpenAI documents `https://api.openai.com/v1` **without** one. It strips
any trailing slashes and appends `/chat/completions`.

The request carries `Authorization: Bearer <api_key>`. Timeout is 120 seconds
(local's is 180; a cloud round trip that exceeds two minutes is a failure worth
reporting rather than waiting on).

### 3. `src-tauri/src/engine/mod.rs` (extended)

Gains `EngineKind`, `Engine`, `select`, `Engine::kind`, and `Engine::extract`,
per Architecture. The existing `ServerStatus`, `HealthStatus`, `api_url`, and
the `cfg`-gated local aliasing are unchanged.

`select` returns `Engine::Cloud` only when **all** of these hold: the setting is
`EngineKind::Cloud`, `cloud_base_url` is non-empty after trimming,
`cloud_model` is non-empty after trimming, and `key` is `Some` and non-empty.
Otherwise `Engine::Local { port }`.

### 4. `src-tauri/src/settings.rs` (extended)

```rust
pub engine: EngineKind,       // default Local
pub cloud_base_url: String,   // default ""
pub cloud_model: String,      // default ""
```

The API key is deliberately absent. `#[serde(default)]` on the struct already
guarantees an older `settings.json` keeps parsing.

### 5. `src-tauri/src/commands.rs` (extended)

- `capture_and_extract` and `re_extract` change their return type from `String`
  to `ExtractionResult { text: String, engine: EngineKind }`. The frontend
  cannot infer the engine from settings, because settings may change between
  the capture and the render; the indicator must report what actually ran.
- Both resolve the engine with
  `engine::select(&settings, keychain::api_key().ok().flatten(), state.port)`,
  then call `engine.extract(...)`.
- Three new commands: `set_cloud_api_key(key)`, `has_cloud_api_key() -> bool`,
  `delete_cloud_api_key()`. **`has_cloud_api_key` returns a boolean, never the
  key.** No command ever returns the key to the frontend; the UI shows only
  whether one is stored.
- `update_settings` gains validation: rejecting `engine: Cloud` when no key is
  stored, or when the base URL or model is blank, with a message naming what is
  missing. Rejection follows the existing save-then-roll-back pattern.

### 6. `src/lib/api.ts` (extended)

`Settings` gains the three fields. New `EngineKind` and `ExtractionResult`
types. `captureAndExtract` / `reExtract` return `ExtractionResult`. Three new
command wrappers matching the Rust side.

### 7. `src/components/SettingsPanel.tsx` (extended)

The static Engine row becomes a real two-way picker. Choosing Cloud reveals
four rows:

- **Provider** — preset buttons (OpenAI, Anthropic, Gemini, Custom) that
  prefill base URL and model. Presets live in one exported constant:

  | Preset | Base URL | Default model |
  |---|---|---|
  | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
  | Anthropic | `https://api.anthropic.com/v1` | `claude-haiku-4-5-20251001` |
  | Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.6-flash` |
  | Custom | *(empty)* | *(empty)* |

  These are prefills, not constraints; both fields stay editable, which is what
  makes Custom work and what keeps a stale default from being a bug.
- **Base URL** — text input.
- **Model** — text input.
- **API key** — a `type="password"` input with Save, plus Remove when a key is
  stored. The stored key is never read back into the field; the UI shows
  "Key stored" from `has_cloud_api_key()`.

Selecting Cloud without a valid configuration surfaces the backend's rejection
inline, reusing the existing `shortcutError` pattern, and the row reverts to
Local.

### 8. `src/hooks/useBeaver.ts` and `src/components/CaptureHud.tsx` (extended)

`useBeaver` tracks `engine: EngineKind | null` from the extraction result and
passes it to the HUD. `CaptureHud` renders a non-interactive 🔒 / ☁️ glyph as
the leading element of the **expanded** chip row only, matching the roadmap:
*"The engine indicator (🔒/☁️) appears only inside the expanded state once BYO
cloud ships."* The collapsed pill is unchanged, so the default reflex gains no
new visual weight.

---

## Data flow

1. **Settings:** the user picks Cloud, picks a preset (prefilling URL and
   model), edits if needed, pastes a key and saves. The key goes to the
   keychain via `set_cloud_api_key`; the URL and model go to `settings.json`
   via `update_settings`, which refuses the combination if anything is missing.
2. **Capture:** `capture_and_extract` loads settings, reads the key from the
   keychain, calls `engine::select`, and runs `engine.extract`. It returns the
   text plus the `EngineKind` that actually ran.
3. **Display:** `useBeaver` stores both. The HUD copies the text immediately as
   it does today, and shows 🔒 or ☁️ when the pill is expanded.
4. **Re-extract:** identical, re-resolving the engine so a settings change
   between captures takes effect without a restart.
5. **Failure:** `engine.extract` returns `Err` with a mapped message; the HUD
   shows its error pill and retry chip, which re-runs the same region.

---

## Error handling

`cloud.rs` maps failures to short, user-readable causes. The mapping is a pure
function of the HTTP status, so it is unit-testable:

| Condition | Message |
|---|---|
| 401 / 403 | `Provider rejected the API key` |
| 429 | `Provider rate limit reached` |
| 5xx | `Provider is unavailable` |
| other non-2xx | `Provider error (HTTP <status>)` |
| transport / timeout | `Couldn't reach the provider` |
| 2xx with no `choices` | `Provider returned an empty response` |

**The API key must never appear in an error string, a log line, or the HUD.**
`reqwest`'s own error `Display` can include the request URL but not headers, so
the key cannot leak through it; nonetheless the mapping above constructs every
message from the status code alone rather than forwarding provider error text,
which some providers echo request context into.

Existing behavior is preserved elsewhere: a missing or corrupt `settings.json`
still falls back to defaults, and since the default engine is Local, a corrupt
settings file can never silently route captures to the cloud.

---

## Testing

Test-first throughout, per the project's standing TDD/YAGNI rule.

- **`engine::select`** — the privacy-critical branch, so it gets the most
  cases: cloud chosen with everything present returns Cloud; each of
  missing key, empty key, blank base URL, blank model individually falls back
  to Local; `EngineKind::Local` returns Local even with a full cloud config
  present.
- **`cloud::chat_completions_url`** — no trailing slash, one trailing slash,
  several trailing slashes, and a base URL that already ends in a path segment.
- **`cloud::build_request`** — the same assertions `llamacpp.rs` already makes
  on content-part shape, plus that `model` comes from `Config`.
- **Response parsing** — first choice extracted; empty `choices` is an error.
- **Error mapping** — one case per row of the table above, plus an explicit
  test that a mapped message never contains a key-shaped substring when the
  config carries one.
- **`keychain`** — round-trip set/get/delete against a **test-only service
  name** so a developer's real keychain entry is never touched, and
  get-when-absent returns `Ok(None)`. These run unattended in CI without
  `#[ignore]`: a probe confirmed that a process reading an item it created
  itself gets no access prompt. To keep that property, the pure
  `errSecItemNotFound` → `Ok(None)` mapping is extracted into its own function
  tested against the raw code `-25300`, so the decoding logic is covered even
  where the OS is not involved.
- **`settings`** — round-trip including the new fields, and forward-compat
  (a settings file written before this change still parses, with engine
  defaulting to Local).
- **`SettingsPanel.test.tsx`** — engine toggle renders; selecting Cloud reveals
  the provider rows; a preset prefills URL and model; saving a key calls
  `set_cloud_api_key`; a rejected Cloud selection shows the error and reverts.
- **`CaptureHud.test.tsx`** — the indicator appears in the expanded state for
  each engine kind and is absent from the collapsed pill.
- **`api.test.ts`** — extended for the new command names, per the existing
  convention that pins every command name to `commands.rs`.

---

## Risks & trade-offs

- **Compat-layer dependence for Anthropic and Gemini.** Documented above and
  accepted deliberately, with a contained mitigation (add a native mapping
  behind the same enum arm) if either degrades.
- **Keychain items are ACL'd to the code signature.** A key saved by the
  notarized DMG build and a key saved by an unsigned `install.sh` build are
  different ACL contexts, so macOS prompts ("Beaver wants to use your
  confidential information") when the signature changes, and a from-source user
  may be re-prompted after each rebuild. Signed-to-signed upgrades keep the same
  Developer ID and are unaffected. This is normal macOS behavior, resolved by
  clicking "Always Allow" once; it is called out in the spec so it is not
  mistaken for a bug during testing.
- **Preset model defaults will age.** `gpt-4o-mini`, `claude-haiku-4-5-20251001`,
  and `gemini-3.6-flash` are prefills into an editable field, not pinned
  requirements, so a stale default is a papercut rather than a break. Worth
  revisiting when the providers rotate their cheap vision tiers.
- **Returning `ExtractionResult` instead of `String` is a breaking IPC change.**
  Contained: two commands, two `useBeaver` call sites, and their tests. Chosen
  over inferring the engine on the frontend, which would report the *current
  setting* rather than what actually ran.

---

## Open questions for the plan

- Exact placement and markup of the 🔒 / ☁️ glyph within the expanded pill's
  flex row, given the existing chip-and-divider grammar.
