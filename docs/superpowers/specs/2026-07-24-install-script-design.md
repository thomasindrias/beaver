# Beaver install.sh — Design Spec

**Date:** 2026-07-24
**Status:** Approved (design); pending spec review before planning
**Author:** Thomas Indrias / Claude

---

## Problem

`docs/ROADMAP.md`'s monetization section commits to a specific distribution
model: *"pay for the built app, build from source for free... the MIT repo
stays open and self-buildable (à la Aseprite)."* Phase 1's Distribution
bullet still lists a Homebrew cask as the free-path plan, which this spec
replaces — a cask still ships a pre-built binary and doesn't serve the
"build from source" half of the promise on its own.

Today, building Beaver from source means following CONTRIBUTING.md's
Development Setup by hand and knowing to run `pnpm tauri build` yourself —
no single command takes a fresh clone to an installed `/Applications` app.
This spec adds `install.sh`: a single script a cloned checkout can run to go
from "prerequisites unknown" to "Beaver.app in Applications."

## Goals

- One command (`./install.sh` from a fresh clone) takes a user from unknown
  machine state to an installed, launchable Beaver.app.
- Clear, actionable failure messages when a build prerequisite is missing —
  no silent failures, no partial installs.
- Safe to re-run: `git pull && ./install.sh` is the expected update path for
  a from-source install.
- Test-first: the script's logic is exercised by an automated test suite,
  not just manual runs.

## Non-Goals (explicit scope cuts)

- **No Homebrew cask.** Explicitly dropped per the task brief; this script
  is the replacement distribution path for Phase 1's cask bullet.
- **No auto-installing prerequisites.** install.sh checks for Rust, Node/pnpm,
  and Xcode Command Line Tools and prints the official install instructions
  if any are missing; it never runs `rustup`, `brew`, `nvm`, or any other
  installer on the user's behalf. Keeps the script simple and predictable,
  and avoids running unattended third-party installers as a side effect of
  a build script.
- **No DMG packaging.** `scripts/release-macos.sh`'s branded-DMG pipeline
  (dmgbuild, tiffutil background compositing, notarization) is for cutting
  public releases, not a local from-source install — see Architecture.
- **No `uv` prerequisite check.** `uv` is bundled as a committed binary
  (`src-tauri/resources/uv`) that the *app itself* shells out to at runtime
  for the MLX Python environment; neither `build.rs` (a no-op) nor
  `beforeBuildCommand` (`pnpm build`) invoke a system `uv`. CONTRIBUTING.md
  lists it as a prerequisite only because contributors use it to run the
  separate Python unit tests and regenerate `requirements.lock` — neither
  of which `install.sh` does.
- **No Windows/Linux support.** Beaver is macOS-only today; install.sh
  detects and exits cleanly on any other OS.
- **No code signing/notarization.** The script installs an unsigned,
  locally-built app, same as any other from-source build; the signed DMG
  remains the paid, notarized artifact.

---

## Architecture

**A single `install.sh` at the repo root, source-guarded for testability.**
Two alternatives were considered:

1. **Split `scripts/install.sh` (entrypoint) + `scripts/lib/install-lib.sh`
   (logic)** — tests source the lib directly, no guard trick needed.
   Rejected: adds a file and a relative-`source` path that has to resolve
   correctly regardless of invocation directory, for a script this size.
2. **Reuse `scripts/release-macos.sh`'s pipeline** (build → dmgbuild → mount
   DMG → copy `.app` out) — rejected: pulls in `uv run --with dmgbuild`,
   `tiffutil`, and branding assets whose entire purpose is producing a
   distributable DMG. install.sh only needs the `.app` bundle itself, which
   plain `pnpm tauri build` already produces at
   `src-tauri/target/release/bundle/macos/*.app`. Note this differs from
   `release-macos.sh`'s own output path
   (`src-tauri/target/<target-triple>/release/bundle/macos/*.app`) — that
   script always passes an explicit `--target`, which makes Cargo nest
   output under a triple directory; a plain `pnpm tauri build` with no
   `--target` does not.

The chosen shape: one file, small single-purpose functions, with the
standard idiom at the bottom so bats can `source` the file and call
functions directly without triggering a real build/install:

```bash
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then main "$@"; fi
```

`BEAVER_INSTALL_DIR` (default `/Applications`) is an overridable variable so
tests exercise install/reinstall logic against a scratch directory, never
the real Applications folder.

```
install.sh
  is_macos() -> bool
  check_command_line_tools() -> bool   # xcode-select -p
  check_rust() -> bool                  # cargo + rustc on PATH
  check_node_and_pnpm() -> bool         # node + pnpm on PATH
  run_build()                           # pnpm install && pnpm tauri build
  find_built_app() -> path              # locate *.app under target/.../bundle/macos
  quit_running_app()                    # osascript 'quit app "Beaver"', errors ignored
  install_app(built_app_path)           # rm -rf old, cp -R new into $BEAVER_INSTALL_DIR
  clear_quarantine(installed_app_path)  # xattr -cr
  main()                                # orchestrates the above, in order
```

---

## Decisions locked during brainstorming

1. **Scope: this spec covers only the install script.** BYO cloud engine
   and the Hugging Face local-model picker are separate specs, sequenced
   after this one.
2. **Prerequisites: check-and-report, not auto-install.** Missing Rust,
   Node/pnpm, or Command Line Tools print the official install command and
   exit non-zero; the user re-runs `install.sh` after installing.
3. **Build via plain `pnpm tauri build`**, not `scripts/release-macos.sh` —
   the DMG pipeline is release-maintainer tooling, not needed for a local
   install.
4. **Install location: `/Applications`** (not `~/Applications`) — matches
   how the DMG-installed app is expected to live, and is writable without
   `sudo` for the common single-admin-user Mac.
5. **Reinstall behavior: quit-then-overwrite.** If `Beaver.app` already
   exists at the install location, a running instance is quit first, then
   the old bundle is replaced. Makes `git pull && ./install.sh` the natural
   update path. Safe because app bundles hold no user data — Beaver's
   settings/history/model cache all live under `app_data_dir()`, untouched
   by replacing the bundle.
6. **Quarantine is cleared automatically** (`xattr -cr`) rather than leaving
   Gatekeeper's right-click-Open friction in place — the binary was just
   built from source on this machine by this user, so there is nothing
   being smuggled past a security boundary.
7. **Testing: bats-core**, added as a new dev dependency for shell-script
   tests. install.sh's functions are individually testable via the
   source-guard idiom and PATH-stubbing; CI installs bats-core with one
   `brew install bats-core` line.

---

## Components

### 1. `install.sh` (new, repo root)

See Architecture for the function list. `main()`'s order:

```
is_macos || exit 1 with "Beaver only builds on macOS."
check_command_line_tools || exit 1 with "Run `xcode-select --install`, then re-run this script."
check_rust || exit 1 with "Install Rust: https://rustup.rs, then re-run this script."
check_node_and_pnpm || exit 1 with "Install Node.js (https://nodejs.org) and pnpm (https://pnpm.io), then re-run this script."
run_build
app_path=$(find_built_app) || exit 1 with an internal-error message (build reported success but no .app found)
quit_running_app
install_app "$app_path"
clear_quarantine "$BEAVER_INSTALL_DIR/Beaver.app"
print success message (Applications location + Screen Recording permission note)
```

No version-number enforcement beyond "the command exists and runs" —
matching CONTRIBUTING.md's own prerequisite list, which doesn't pin exact
versions either (pnpm's pinned version is already handled by the repo's
`packageManager` field + Corepack).

### 2. `install.bats` (new, repo root)

Bats test suite. Sources `install.sh` (the guard prevents `main` from
running on source) and tests functions directly:

- `is_macos` — stub `uname` via a `PATH`-prepended fake executable
  returning `Darwin` / `Linux`.
- `check_command_line_tools` / `check_rust` / `check_node_and_pnpm` — stub
  `xcode-select`, `cargo`/`rustc`, `node`/`pnpm` present vs. absent on
  `PATH`.
- `install_app` / `quit_running_app` — run against a scratch
  `BEAVER_INSTALL_DIR` (a bats `TEST_TMPDIR`), verifying: fresh install
  copies the app in; reinstall over an existing `Beaver.app` replaces it;
  `quit_running_app` doesn't error when no such app is running.
- `find_built_app` — verified against a fixture directory tree standing in
  for `target/.../bundle/macos/`.

The real `pnpm tauri build` and a real `/Applications` write are not
exercised by bats — see Testing below.

### 3. `.github/workflows/ci.yml` (extended)

New step: `brew install bats-core` followed by `bats install.bats`,
alongside the existing frontend/Rust/Python verification steps.

### 4. `CONTRIBUTING.md` (extended)

Verification section gains `bats install.bats` in the list of pre-PR
checks.

### 5. `README.md` (extended)

"Install (macOS)" gains a "Build from source" alternative alongside the DMG
download steps:

```bash
git clone https://github.com/thomasindrias/beaver.git
cd beaver
./install.sh
```

### 6. `docs/ROADMAP.md` (extended)

Phase 1's Distribution bullet drops "Homebrew cask" and references the
install script instead.

---

## Flow

1. User clones the repo and runs `./install.sh`.
2. Prerequisite checks run in order; the first failure prints one specific,
   actionable line and exits — no build is attempted with a known-broken
   toolchain.
3. `pnpm install && pnpm tauri build` runs, producing an unsigned `.app`
   under `src-tauri/target/release/bundle/macos/`.
4. If a running Beaver instance exists, it's quit gracefully.
5. Any existing `Beaver.app` at `$BEAVER_INSTALL_DIR` is removed; the fresh
   build is copied in.
6. The installed bundle's quarantine flag is cleared.
7. A success message prints, matching the tone of the DMG install steps in
   README.md (mentioning the Screen Recording permission prompt on first
   launch).

Re-running the script (e.g. after `git pull`) repeats the same flow end to
end — steps 4-6 are exactly the reinstall/update path.

---

## Error Handling

- `set -euo pipefail` throughout, matching `scripts/release-macos.sh`'s
  existing style.
- Every prerequisite failure exits `1` with a single actionable line, before
  any build or filesystem side effect.
- `pnpm tauri build` failures propagate via `set -e`; the script does not
  reinterpret Cargo/tsc error output, it just stops.
- A build that reports success but yields no discoverable `.app` is treated
  as an internal error (script/path-assumption bug, not a user
  misconfiguration) with a distinct message, so it surfaces as a bats test
  failure rather than a confusing runtime one.
- `quit_running_app` failures (e.g. Beaver isn't running) are swallowed —
  this is expected on a first install and not an error condition.

---

## Testing

Test-first throughout, per the project's standing TDD/YAGNI rule.

- **`install.bats`:** covers every function above `run_build` and
  `main` via source-guard + `PATH`-stubbing + a scratch `BEAVER_INSTALL_DIR`,
  per Components.
- **Manual smoke test (not automated):** a full `./install.sh` run against
  a real machine state before merging — the same precedent CONTRIBUTING.md
  already sets for `scripts/release-macos.sh`, which also has no automated
  execution test (running a real multi-minute Tauri build + notarization
  round-trip in CI on every change isn't worth it; a human runs it before
  a release/merge).
- **CI:** `bats install.bats` runs on every PR (fast — pure logic, no real
  build), giving fast feedback on the testable 90% of the script without
  needing a full build in the loop.

---

## Risks & Trade-offs

- **No automated test exercises the real build+install end to end** — the
  bats suite proves the logic around the build (checks, path-finding,
  reinstall, quarantine) is correct, but a full `pnpm tauri build` inside
  CI on every PR would be slow and largely redundant with the existing
  `cargo test` / `pnpm build` steps already in `ci.yml`. Accepted trade-off,
  consistent with how `release-macos.sh` is already handled.
- **`xattr -cr` clears quarantine unconditionally.** This is the intended
  behavior for a script whose entire job is installing a binary the user's
  own machine just built, but it does mean install.sh is not a place to add
  any future "verify before trusting" step without revisiting this
  decision.
- **No version pinning on Rust/Node/pnpm.** If a future toolchain
  incompatibility appears, the check would need a minimum-version comparison
  added — deferred until it's an actual observed problem (YAGNI).

---

## Open questions for the plan

- Whether `check_rust`/`check_node_and_pnpm` need to distinguish "command
  missing" from "command present but broken" (e.g. a `cargo` on `PATH` that
  fails to run) — leaning toward treating both as the same failure message
  for simplicity, but the plan should confirm.
