# Production Release Hardening (v0.1.0 public launch)

**Date:** 2026-07-02
**Status:** Approved scope ("Approach B"), design pending user review
**Goal:** Make Beaver recoverable, diagnosable, and updatable on strangers' Macs, then tag the first public release.

## Context

Beaver already has green CI (frontend, website, Rust, Python), a signed/notarized DMG
pipeline, and full OSS scaffolding (README, SECURITY, CONTRIBUTING, MIT license). The
remaining gaps are all failure-path and operability issues: what happens when setup
fails, when Screen Recording permission is missing, when the app crashes, and when a
fixed version ships after users have already installed a broken one.

**Scope decision:** fix the four ship-blockers plus the minimum operability layer
(logging, update visibility, dependency pinning, disk preflight, CSP) and launch
polish (README demo, repo hygiene). Auto-updater, Homebrew cask, and configurable
shortcut are explicitly deferred to v0.2+.

## 1. Setup failure recovery (P0)

**Problem:** A failed env build or model download dead-ends the app. The error
screen's "Continue anyway" calls `finish_onboarding`, which writes the
setup-complete marker — so onboarding never reappears and there is no retry path.

**Design:**

- Extract the setup-thread body in `lib.rs` into a reusable `spawn_setup(handle)`
  function. Guard with an atomic `setup_running` flag on `MlxServer` state so
  concurrent retries can't stack.
- Add `failure: Mutex<Option<String>>` to `MlxServer`. Every path that sets
  `SetupPhase::Failed` stores a short, user-readable reason (disk space, network,
  spawn failure, generic). `mlx_status` gains a `detail: Option<String>` field.
- New Tauri command `retry_setup`: kills any existing server child, resets phase to
  `BuildingEnv`, clears `failure`, and re-runs `spawn_setup`. No-op if setup is
  already running.
- `finish_onboarding` stops writing the setup marker. The readiness poll already
  writes it when the server reaches `ready` (the only correct moment).
- `ModelDownload` error UI: show the failure detail and a **Try again** button that
  invokes `retry_setup` and resumes polling. Remove "Continue anyway".
- Post-onboarding failures: `TrayPopover` shows a thin status banner whenever
  `mlx_status` reports `error` (or stays non-ready for >10s after open), with the
  detail text and a Retry button wired to the same command.

## 2. Screen Recording permission flow (P0)

**Problem:** Nothing checks capture permission. An unauthorized app silently
captures black frames, so a new user's first capture yields garbage with no
explanation. macOS TCC grants for Screen Recording take effect only after relaunch.

**Design:**

- Rust FFI to CoreGraphics: `CGPreflightScreenCaptureAccess()` and
  `CGRequestScreenCaptureAccess()` (both macOS 10.15+; minimum system is 13.0).
  Exposed as commands `screen_permission_granted() -> bool` and
  `request_screen_permission()`. A settings deep-link
  (`x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`)
  is used when the one-time system prompt has already been burned.
- Onboarding gains a **permission step** between download and ready, shown only when
  preflight fails: explains why Beaver needs it, "Grant access" button fires the
  request, then the UI polls preflight (1s). Once granted, show a **Relaunch
  Beaver** button (`app.restart()`) because capture APIs honor the grant only after
  relaunch. After relaunch, the setup marker + granted permission take the user
  straight to normal operation.
- Capture-time guard: `capture_and_extract` preflights first and returns a distinct
  error (`"screen-permission-missing"`); the cursor toast maps it to "Beaver needs
  Screen Recording access — check System Settings". The popover banner (section 1)
  also surfaces missing permission with an "Open System Settings" button, so there
  is a discoverable fix path, not just a transient toast.

## 3. Logging (P0)

**Problem:** All diagnostics are `eprintln!`, which goes nowhere in a bundled .app;
the Python server inherits the same void. Support is impossible.

**Design:**

- Add `tauri-plugin-log` v2: file target in the platform log dir
  (`~/Library/Logs/se.djtl.beaver/beaver.log`) with rotation, plus stdout in dev.
  Replace all `eprintln!` call sites with `log::` macros. Log the resolved log-dir
  path and app version at startup.
- `spawn_server` redirects the Python child's stdout+stderr (append) to
  `mlx-server.log` in the same log dir. `mlx_server.py` keeps printing meaningful
  errors (model load failure already does).
- The bug-report issue template (section 8) tells users where the logs live.

## 4. Orphaned MLX server watchdog (P0)

**Problem:** The Python child is killed only on clean exit. A crash or force-quit
leaves a ~4 GB resident process running forever.

**Design:**

- `mlx_server.py` accepts `--parent-pid <pid>`; a daemon thread checks every 2s
  whether `os.getppid()` still equals it (orphaned children are reparented) and
  calls `os._exit(0)` when it doesn't. Omitting the flag disables the watchdog
  (tests, manual runs). `spawn_server` passes `std::process::id()`.

## 5. Update visibility (P1)

**Problem:** v0.1.0 installs can never learn that a fix exists. A full signed
auto-updater is deferred; the launch needs passive visibility only.

**Design:**

- Rust command `check_for_update() -> Option<{version, url}>`: GET
  `https://api.github.com/repos/thomasindrias/beaver/releases/latest` (5s timeout),
  compare the tag against the app version with a simple numeric semver triple
  compare. Result + timestamp cached in app-data; the network call happens at most
  once per 24h, and only when the popover opens (never in the background).
  `BEAVER_DISABLE_UPDATE_CHECK=1` skips it entirely.
- `TrayPopover` header shows a subtle "vX.Y.Z available" pill linking to the release
  page (requires `tauri-plugin-opener` + capability entry).
- Privacy honesty: README and SECURITY.md state exactly what this is — one HTTPS
  request to api.github.com, at most daily, containing no capture data — and how to
  disable it. The "everything after runs offline" claim gets qualified accordingly.

## 6. Python dependency pinning (P1)

**Problem:** `requirements.txt` pins only `mlx-vlm==0.5.0`; a bad transitive release
(fastapi, uvicorn, huggingface-hub, …) breaks first-run installs for new users with
no change on our side.

**Design:**

- Generate `requirements.lock` with `uv pip compile requirements.txt` (Python 3.12,
  macOS arm64). Bundle it as a resource; `build_env` installs from the lock.
  `requirements.txt` stays as the human-edited source; CONTRIBUTING documents the
  regen command. CI installs from the lock so drift is caught.

## 7. Disk-space preflight (P1)

**Problem:** First-run setup needs roughly 8 GB (venv ~2 GB + model ~3 GB +
headroom); an insufficient disk fails mid-download with a generic error.

**Design:**

- Before building the env on a first run, check available space on the app-data
  volume (`fs4::available_space`). Below 8 GB → `SetupPhase::Failed` with detail
  "Beaver needs about 8 GB free to set up its on-device model. Free up space and
  try again." — surfaced by the section-1 error UI with its Try again button.
  Skipped entirely once setup is complete.

## 8. CSP + repo hygiene + launch assets (P1/P2)

- **CSP:** replace `"csp": null` with a strict policy:
  `default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob:;
  style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost`.
  Verified manually in both `tauri dev` and a release build (vibrancy, animations,
  onboarding, capture flow).
- **Repo hygiene:** `.github/ISSUE_TEMPLATE/bug_report.yml` (macOS version, chip,
  log attachment instructions), `feature_request.yml`, `PULL_REQUEST_TEMPLATE.md`.
  Repo topics + social preview set via `gh` at release time.
- **README demo:** hero media section at the top (GIF/screenshot of the capture
  flow + popover). Asset capture is a collaborative final step: static shots I can
  produce from a running build; the drag-capture GIF needs a human hand.
- **Website:** verify the download CTA resolves to the latest GitHub release asset.
- **Versioning:** stay `0.1.0`; first public tag is `v0.1.0` (semver honesty — no
  real-world exposure yet). Add `CHANGELOG.md` (Keep a Changelog format) and a short
  release checklist in CONTRIBUTING.

## Testing

TDD throughout (superpowers:test-driven-development):

- **Rust:** unit tests for semver compare, failure-detail plumbing, disk-threshold
  gating logic (threshold function isolated from statvfs), watchdog arg wiring.
- **Frontend (vitest):** error state renders detail + Try again invokes
  `retry_setup`; permission step transitions (blocked → granted → relaunch);
  update pill renders when `check_for_update` returns a version.
- **Python (unittest):** watchdog exits when parent pid changes (subprocess-based
  test), disabled when flag absent; existing progress tests keep passing.
- **End-to-end:** manual verification matrix before tagging — fresh-install
  onboarding (happy path), setup failure + retry (network cut mid-download),
  permission-denied first capture, force-quit orphan check (`pgrep -f mlx_server`),
  CSP smoke test, unsigned + signed DMG install.

## Release sequence

1. Land hardening PRs on `main` (branch off `codex/open-source-launch-cleanup`
   after it merges).
2. Run the manual verification matrix on a release build.
3. `Release macOS` workflow with tag `v0.1.0` → draft release; write release notes.
4. Make repo public, set topics/social preview, publish release, verify website
   download link.

## Out of scope (deferred to v0.2+)

Signed auto-updater (`tauri-plugin-updater`), Homebrew cask, configurable capture
shortcut, history pruning/limits, crash reporting (deliberately omitted —
privacy-first stance).
