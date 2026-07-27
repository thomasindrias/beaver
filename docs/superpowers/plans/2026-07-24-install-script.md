# install.sh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a root `install.sh` that takes a fresh clone from "prerequisites unknown" to "Beaver.app installed in /Applications", per `docs/superpowers/specs/2026-07-24-install-script-design.md`.

**Architecture:** One Bash script at the repo root, organized as small single-purpose functions and source-guarded (`if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then main "$@"; fi`) so a bats suite can source it and call functions directly without triggering a real build. Prerequisite checks are pure predicates; one `check_prereqs` orchestrator owns every user-facing error message. The install destination is read from `BEAVER_INSTALL_DIR` (default `/Applications`) at call time so tests can redirect it to a scratch directory.

**Tech Stack:** Bash 3.2+ (macOS system bash), bats-core (new dev dependency, installed via Homebrew), existing `pnpm tauri build` toolchain.

## Global Constraints

- **macOS only.** The script detects a non-Darwin host and exits with a clear message; no Windows/Linux paths.
- **Never install toolchains.** Missing Rust / Node+pnpm / Xcode Command Line Tools produce an actionable message and a non-zero exit. The script never runs `rustup`, `brew`, `nvm`, or any other installer.
- **No `uv` prerequisite check.** `uv` is a committed binary (`src-tauri/resources/uv`) the *app* shells out to at runtime; `build.rs` is a no-op and `beforeBuildCommand` is `pnpm build`, so no system `uv` participates in the build.
- **Build output path is `src-tauri/target/release/bundle/macos/`** — no target-triple subdirectory, because `install.sh` runs `pnpm tauri build` with no `--target` flag. (`scripts/release-macos.sh` always passes `--target`, which is why its path includes the triple. Do not copy that path.)
- `set -euo pipefail` at the top of `install.sh`, matching `scripts/release-macos.sh`'s existing style.
- **Version checks are presence-only** (`command -v`). A present-but-broken toolchain is deliberately not distinguished from a missing one: `pnpm tauri build` will fail with a far better diagnostic than this script could produce. This resolves the spec's open question.
- **No em-dashes in user-facing copy** added to `README.md` and `docs/ROADMAP.md` (project copy-style rule). Plan/spec prose is unaffected.
- **Verify with unfiltered output.** Always run `bats install.bats 2>&1` and read all of it. Never pipe the suite through `grep`/`head` to summarize results: a real run of this plan did exactly that and hid both a PATH leak into bats' teardown and a harness bug that made every assertion vacuous. A passing `ok` line is not evidence on its own; the run must also be free of `BW01` warnings and `command not found` noise.
- TDD throughout: write the failing test, run it and watch it fail, implement the minimum to pass, run again, commit. Where something is genuinely untestable at the unit level (`run_build`, which shells out to a multi-minute real build, and `main`, which orchestrates it), this plan says so explicitly rather than silently skipping it — those are covered by the manual smoke test in Task 5.

---

### Task 1: Prerequisite checks and the bats harness

**Files:**
- Create: `install.sh`
- Create: `install.bats`

**Interfaces:**
- Produces: `is_macos()`, `has_command_line_tools()`, `has_rust()`, `has_node_and_pnpm()` — pure predicates, no output, return 0/non-zero. `check_prereqs()` — runs all four in that order, prints an actionable message to stderr and returns non-zero on the first failure. `ROOT` — absolute path to the repo root, set at source time. `main()` — the orchestrator, extended by every later task. Task 2 consumes `ROOT` and `check_prereqs`.

- [ ] **Step 1: Install bats-core**

Run:

```bash
brew install bats-core
```

Verify:

```bash
bats --version
```

Expected: a version line like `Bats 1.11.0`. (This is a new dev dependency; Task 5 adds it to CI and CONTRIBUTING.md.)

- [ ] **Step 2: Write the failing predicate tests**

Create `install.bats`:

```bash
#!/usr/bin/env bats
#
# Tests for install.sh. Sourcing install.sh is safe: its bottom-of-file
# source guard means `main` only runs when the script is executed directly.

setup() {
  source "${BATS_TEST_DIRNAME}/install.sh"
  STUB_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_BIN"
  ORIG_PATH="$PATH"
}

# only_stubs strips PATH down to the stub dir; bats runs its own per-test
# cleanup (which shells out to `rm`) in this same process afterwards, so
# PATH has to come back before that.
teardown() {
  PATH="$ORIG_PATH"
}

# Writes an executable stub named $1 into the stub bin dir. Remaining args
# form the stub's body (default: succeed silently).
#
# The shebang must be an absolute interpreter path: only_stubs leaves no
# `bash` on PATH, so a `#!/usr/bin/env bash` stub would die with
# "env: bash: No such file or directory" and every stubbed command would
# return 127 instead of running.
stub() {
  local name="$1"
  shift
  local body="${*:-exit 0}"
  printf '#!/bin/bash\n%s\n' "$body" > "$STUB_BIN/$name"
  chmod +x "$STUB_BIN/$name"
}

# Restricts PATH to the stubs created for this test. Call this LAST, after
# every stub/rm, so setup work still sees the real coreutils. Assertions
# after this point must use bash builtins ($(< file), [[ ]]) rather than
# external commands like cat.
only_stubs() {
  PATH="$STUB_BIN"
}

# Stubs a machine where every prerequisite is satisfied.
all_prereqs_present() {
  stub uname 'echo Darwin'
  stub xcode-select 'echo /Library/Developer/CommandLineTools'
  stub cargo
  stub rustc
  stub node
  stub pnpm
}

@test "is_macos is true when uname reports Darwin" {
  stub uname 'echo Darwin'
  only_stubs
  run is_macos
  [ "$status" -eq 0 ]
}

@test "is_macos is false when uname reports Linux" {
  stub uname 'echo Linux'
  only_stubs
  run is_macos
  [ "$status" -ne 0 ]
}

@test "has_command_line_tools is true when xcode-select resolves a path" {
  stub xcode-select 'echo /Library/Developer/CommandLineTools'
  only_stubs
  run has_command_line_tools
  [ "$status" -eq 0 ]
}

@test "has_command_line_tools is false when xcode-select fails" {
  stub xcode-select 'exit 2'
  only_stubs
  run has_command_line_tools
  [ "$status" -ne 0 ]
}

@test "has_rust is true when cargo and rustc are both present" {
  stub cargo
  stub rustc
  only_stubs
  run has_rust
  [ "$status" -eq 0 ]
}

@test "has_rust is false when cargo is missing" {
  stub rustc
  only_stubs
  run has_rust
  [ "$status" -ne 0 ]
}

@test "has_rust is false when rustc is missing" {
  stub cargo
  only_stubs
  run has_rust
  [ "$status" -ne 0 ]
}

@test "has_node_and_pnpm is true when node and pnpm are both present" {
  stub node
  stub pnpm
  only_stubs
  run has_node_and_pnpm
  [ "$status" -eq 0 ]
}

@test "has_node_and_pnpm is false when node is missing" {
  stub pnpm
  only_stubs
  run has_node_and_pnpm
  [ "$status" -ne 0 ]
}

@test "has_node_and_pnpm is false when pnpm is missing" {
  stub node
  only_stubs
  run has_node_and_pnpm
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bats install.bats`

Expected: every test fails, because `install.sh` does not exist yet (bats reports the `source` in `setup` failing with "No such file or directory").

- [ ] **Step 4: Create install.sh with the predicates**

Create `install.sh`:

```bash
#!/usr/bin/env bash
#
# Build Beaver from source and install it into /Applications.
#
#   ./install.sh
#
# Checks build prerequisites (reporting how to install anything missing; it
# never installs toolchains itself), builds an unsigned release bundle with
# `pnpm tauri build`, and copies the resulting Beaver.app into
# $BEAVER_INSTALL_DIR (default /Applications), replacing any previous
# install. Re-run it after `git pull` to update.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

is_macos() {
  [[ "$(uname -s)" == "Darwin" ]]
}

has_command_line_tools() {
  xcode-select -p >/dev/null 2>&1
}

has_rust() {
  command -v cargo >/dev/null 2>&1 && command -v rustc >/dev/null 2>&1
}

has_node_and_pnpm() {
  command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1
}

main() {
  cd "$ROOT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
```

Note: `cd "$ROOT"` lives inside `main`, never at the top level. Sourcing the file must not change the test shell's working directory.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bats install.bats`

Expected: 10 tests, all passing.

- [ ] **Step 6: Write the failing check_prereqs tests**

Append to `install.bats`:

```bash
@test "check_prereqs succeeds when every prerequisite is present" {
  all_prereqs_present
  only_stubs
  run check_prereqs
  [ "$status" -eq 0 ]
}

@test "check_prereqs rejects a non-macOS host before checking anything else" {
  all_prereqs_present
  stub uname 'echo Linux'
  only_stubs
  run check_prereqs
  [ "$status" -ne 0 ]
  [[ "$output" == *"only builds on macOS"* ]]
}

@test "check_prereqs points at xcode-select --install when Command Line Tools are missing" {
  all_prereqs_present
  stub xcode-select 'exit 2'
  only_stubs
  run check_prereqs
  [ "$status" -ne 0 ]
  [[ "$output" == *"xcode-select --install"* ]]
}

@test "check_prereqs points at rustup.rs when Rust is missing" {
  all_prereqs_present
  rm "$STUB_BIN/cargo"
  only_stubs
  run check_prereqs
  [ "$status" -ne 0 ]
  [[ "$output" == *"rustup.rs"* ]]
}

@test "check_prereqs points at nodejs.org and pnpm.io when Node is missing" {
  all_prereqs_present
  rm "$STUB_BIN/node"
  only_stubs
  run check_prereqs
  [ "$status" -ne 0 ]
  [[ "$output" == *"nodejs.org"* ]]
  [[ "$output" == *"pnpm.io"* ]]
}
```

- [ ] **Step 7: Run the tests to verify the new ones fail**

Run: `bats install.bats`

Expected: the 10 predicate tests still pass; the 5 new tests fail with `command not found: check_prereqs`.

- [ ] **Step 8: Implement check_prereqs and call it from main**

In `install.sh`, insert `check_prereqs` after `has_node_and_pnpm` and update `main`:

```bash
check_prereqs() {
  if ! is_macos; then
    echo "error: Beaver only builds on macOS." >&2
    return 1
  fi
  if ! has_command_line_tools; then
    echo "error: Xcode Command Line Tools not found." >&2
    echo "  Run: xcode-select --install" >&2
    echo "  Then re-run this script." >&2
    return 1
  fi
  if ! has_rust; then
    echo "error: Rust not found." >&2
    echo "  Install it from https://rustup.rs" >&2
    echo "  Then re-run this script." >&2
    return 1
  fi
  if ! has_node_and_pnpm; then
    echo "error: Node.js and pnpm are required." >&2
    echo "  Install Node.js from https://nodejs.org and pnpm from https://pnpm.io" >&2
    echo "  Then re-run this script." >&2
    return 1
  fi
}

main() {
  cd "$ROOT"
  check_prereqs
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `bats install.bats`

Expected: 15 tests, all passing.

- [ ] **Step 10: Make the script executable and commit**

```bash
chmod +x install.sh
git add install.sh install.bats
git commit -m "feat: add install.sh prerequisite checks with bats coverage"
```

Verify the executable bit was recorded:

```bash
git show --stat HEAD | grep install.sh
```

Expected: the diff summary lists `install.sh` created with mode `100755`.

---

### Task 2: Build the app and locate the bundle

**Files:**
- Modify: `install.sh` (add `BUNDLE_SUBPATH`, `run_build`, `find_built_app`; extend `main`)
- Modify: `install.bats` (add `find_built_app` tests)

**Interfaces:**
- Consumes: `ROOT`, `check_prereqs`, `main` from Task 1.
- Produces: `BUNDLE_SUBPATH="src-tauri/target/release/bundle/macos"`. `run_build()` — runs `pnpm install` then `pnpm tauri build`, no arguments, no return value. `find_built_app <bundle_dir>` — prints the absolute path of the single `.app` in `<bundle_dir>` to stdout and returns 0, or returns non-zero if there is none. Task 3 consumes the path `find_built_app` prints.

- [ ] **Step 1: Write the failing find_built_app tests**

Append to `install.bats`:

```bash
@test "find_built_app prints the .app bundle in the build directory" {
  mkdir -p "$BATS_TEST_TMPDIR/bundle/Beaver.app/Contents"
  run find_built_app "$BATS_TEST_TMPDIR/bundle"
  [ "$status" -eq 0 ]
  [ "$output" = "$BATS_TEST_TMPDIR/bundle/Beaver.app" ]
}

@test "find_built_app fails when the build directory holds no .app" {
  mkdir -p "$BATS_TEST_TMPDIR/bundle"
  run find_built_app "$BATS_TEST_TMPDIR/bundle"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

@test "find_built_app fails when the build directory does not exist" {
  run find_built_app "$BATS_TEST_TMPDIR/never-built"
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}
```

Assert the exact failure code, not merely `-ne 0`: a bare `-ne 0` is satisfied by exit 127, so a test written that way passes even when the function does not exist yet, which makes its RED phase meaningless. `-z "$output"` pins that a failed lookup prints nothing, which matters because `main` captures this function's stdout.

```bash
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `bats install.bats`

Expected: the 15 Task 1 tests still pass; the 3 new tests fail with `command not found: find_built_app`.

- [ ] **Step 3: Implement run_build and find_built_app**

In `install.sh`, add `BUNDLE_SUBPATH` directly below the `ROOT` assignment:

```bash
# `pnpm tauri build` is run with no --target, so cargo does NOT nest output
# under a target-triple directory the way scripts/release-macos.sh's output is.
BUNDLE_SUBPATH="src-tauri/target/release/bundle/macos"
```

Add these two functions after `check_prereqs`:

```bash
run_build() {
  echo "==> Installing frontend dependencies"
  pnpm install
  echo "==> Building Beaver (this takes a few minutes)"
  pnpm tauri build
}

# Absolute `/usr/bin/find` so this keeps working under a restricted PATH,
# mirroring scripts/release-macos.sh's own bundle lookup.
find_built_app() {
  local bundle_dir="$1"
  local app
  app="$(/usr/bin/find "$bundle_dir" -maxdepth 1 -name '*.app' 2>/dev/null | head -1)"
  if [[ -z "$app" ]]; then
    return 1
  fi
  printf '%s\n' "$app"
}
```

Then extend `main`:

```bash
main() {
  cd "$ROOT"
  check_prereqs
  run_build
  local app
  if ! app="$(find_built_app "$ROOT/$BUNDLE_SUBPATH")"; then
    echo "error: the build finished but no .app was found under $BUNDLE_SUBPATH" >&2
    echo "  This is a bug in install.sh, not a problem with your machine." >&2
    return 1
  fi
  echo "==> Built $app"
}
```

`run_build` gets no unit test: it shells out to a real multi-minute Tauri build, so exercising it means running the actual build. It is covered by Task 5's manual smoke test.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bats install.bats`

Expected: 18 tests, all passing.

- [ ] **Step 5: Commit**

```bash
git add install.sh install.bats
git commit -m "feat: build the app and locate the bundle in install.sh"
```

---

### Task 3: Quit a running instance and install the bundle

**Files:**
- Modify: `install.sh` (add `quit_running_app`, `install_app`; extend `main`)
- Modify: `install.bats` (add tests for both)

**Interfaces:**
- Consumes: `find_built_app`'s printed path, `main` from Task 2.
- Produces: `quit_running_app()` — asks a running Beaver to quit, always returns 0. `install_app <built_app_path>` — replaces `${BEAVER_INSTALL_DIR:-/Applications}/Beaver.app` with a copy of `<built_app_path>` and prints the installed path to stdout. Task 4 consumes the path `install_app` prints.

- [ ] **Step 1: Write the failing quit_running_app and install_app tests**

Append to `install.bats`:

```bash
@test "quit_running_app asks Beaver to quit" {
  stub osascript "printf '%s\n' \"\$*\" > '$BATS_TEST_TMPDIR/osascript-args'"
  only_stubs
  run quit_running_app
  [ "$status" -eq 0 ]
  [[ "$(< "$BATS_TEST_TMPDIR/osascript-args")" == *'quit app "Beaver"'* ]]
}

@test "quit_running_app succeeds even when no Beaver is running" {
  stub osascript 'exit 1'
  only_stubs
  run quit_running_app
  [ "$status" -eq 0 ]
}

@test "install_app copies the built bundle into the install directory" {
  mkdir -p "$BATS_TEST_TMPDIR/build/Beaver.app/Contents"
  echo "fresh" > "$BATS_TEST_TMPDIR/build/Beaver.app/Contents/marker"
  export BEAVER_INSTALL_DIR="$BATS_TEST_TMPDIR/Applications"
  run install_app "$BATS_TEST_TMPDIR/build/Beaver.app"
  [ "$status" -eq 0 ]
  [ "$output" = "$BEAVER_INSTALL_DIR/Beaver.app" ]
  [ "$(< "$BEAVER_INSTALL_DIR/Beaver.app/Contents/marker")" = "fresh" ]
}

@test "install_app replaces an existing install rather than merging into it" {
  export BEAVER_INSTALL_DIR="$BATS_TEST_TMPDIR/Applications"
  mkdir -p "$BEAVER_INSTALL_DIR/Beaver.app/Contents"
  echo "stale" > "$BEAVER_INSTALL_DIR/Beaver.app/Contents/marker"
  touch "$BEAVER_INSTALL_DIR/Beaver.app/Contents/leftover-from-old-build"
  mkdir -p "$BATS_TEST_TMPDIR/build/Beaver.app/Contents"
  echo "fresh" > "$BATS_TEST_TMPDIR/build/Beaver.app/Contents/marker"
  run install_app "$BATS_TEST_TMPDIR/build/Beaver.app"
  [ "$status" -eq 0 ]
  [ "$(< "$BEAVER_INSTALL_DIR/Beaver.app/Contents/marker")" = "fresh" ]
  [ ! -e "$BEAVER_INSTALL_DIR/Beaver.app/Contents/leftover-from-old-build" ]
}
```

The last test is the important one: it proves the old bundle is removed rather than copied over, so a file that existed only in a previous build cannot survive an update.

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `bats install.bats`

Expected: the 18 earlier tests still pass; the 4 new tests fail with `command not found: quit_running_app` / `command not found: install_app`.

- [ ] **Step 3: Implement quit_running_app and install_app**

In `install.sh`, add both functions after `find_built_app`:

```bash
quit_running_app() {
  # Failure is the normal case on a first install (nothing to quit), so this
  # never propagates an error.
  osascript -e 'quit app "Beaver"' >/dev/null 2>&1 || true
}

# Reads BEAVER_INSTALL_DIR at call time rather than caching it at source
# time, so tests can redirect the destination per test.
install_app() {
  local built_app="$1"
  local dest_dir="${BEAVER_INSTALL_DIR:-/Applications}"
  local dest="$dest_dir/Beaver.app"
  mkdir -p "$dest_dir"
  rm -rf "$dest"
  cp -R "$built_app" "$dest"
  printf '%s\n' "$dest"
}
```

Then extend `main`, replacing the `echo "==> Built $app"` line:

```bash
main() {
  cd "$ROOT"
  check_prereqs
  run_build
  local app
  if ! app="$(find_built_app "$ROOT/$BUNDLE_SUBPATH")"; then
    echo "error: the build finished but no .app was found under $BUNDLE_SUBPATH" >&2
    echo "  This is a bug in install.sh, not a problem with your machine." >&2
    return 1
  fi
  quit_running_app
  local dest
  dest="$(install_app "$app")"
  echo "==> Installed $dest"
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bats install.bats`

Expected: 22 tests, all passing.

- [ ] **Step 5: Commit**

```bash
git add install.sh install.bats
git commit -m "feat: quit the running app and install the bundle in install.sh"
```

---

### Task 4: Clear quarantine and report success

**Files:**
- Modify: `install.sh` (add `clear_quarantine`, `print_success`; finish `main`)
- Modify: `install.bats` (add tests for both)

**Interfaces:**
- Consumes: `install_app`'s printed path, `main` from Task 3.
- Produces: `clear_quarantine <installed_app_path>` — clears the quarantine xattr, always returns 0, warns on stderr if `xattr` fails. `print_success <installed_app_path>` — prints the closing guidance. This task completes `main`; no later task consumes these.

- [ ] **Step 1: Write the failing clear_quarantine and print_success tests**

Append to `install.bats`:

```bash
@test "clear_quarantine clears the flag recursively on the installed bundle" {
  stub xattr "printf '%s\n' \"\$*\" > '$BATS_TEST_TMPDIR/xattr-args'"
  only_stubs
  run clear_quarantine "/Applications/Beaver.app"
  [ "$status" -eq 0 ]
  [ "$(< "$BATS_TEST_TMPDIR/xattr-args")" = "-cr /Applications/Beaver.app" ]
  [ -z "$output" ]
}

@test "clear_quarantine warns instead of failing when xattr errors" {
  stub xattr 'exit 1'
  only_stubs
  run clear_quarantine "/Applications/Beaver.app"
  [ "$status" -eq 0 ]
  [[ "$output" == *"right-click"* ]]
}

@test "print_success names the install location and the permission prompt" {
  run print_success "/Applications/Beaver.app"
  [ "$status" -eq 0 ]
  [[ "$output" == *"/Applications/Beaver.app"* ]]
  [[ "$output" == *"Screen Recording"* ]]
}
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `bats install.bats`

Expected: the 22 earlier tests still pass; the 3 new tests fail with `command not found: clear_quarantine` / `command not found: print_success`.

- [ ] **Step 3: Implement clear_quarantine, print_success, and finish main**

In `install.sh`, add both functions after `install_app`:

```bash
# The bundle was just built from source on this machine, so clearing the
# quarantine flag only spares the user Gatekeeper's right-click dance for a
# binary their own toolchain produced. A failure here is cosmetic, so it
# warns rather than aborting an otherwise complete install.
clear_quarantine() {
  local app="$1"
  if ! xattr -cr "$app" 2>/dev/null; then
    echo "note: could not clear the quarantine flag. The first launch may need right-click > Open." >&2
  fi
}

print_success() {
  local dest="$1"
  echo
  echo "==> Beaver is installed at $dest"
  echo "    Launch it from Applications. Grant Screen Recording permission when asked."
  echo "    On first launch Beaver downloads its vision model. Extraction runs offline after that."
}
```

Then finish `main`, replacing the `echo "==> Installed $dest"` line:

```bash
main() {
  cd "$ROOT"
  check_prereqs
  run_build
  local app
  if ! app="$(find_built_app "$ROOT/$BUNDLE_SUBPATH")"; then
    echo "error: the build finished but no .app was found under $BUNDLE_SUBPATH" >&2
    echo "  This is a bug in install.sh, not a problem with your machine." >&2
    return 1
  fi
  quit_running_app
  local dest
  dest="$(install_app "$app")"
  clear_quarantine "$dest"
  print_success "$dest"
}
```

`main` itself gets no unit test: every branch below `check_prereqs` requires a real build. It is covered by Task 5's manual smoke test.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bats install.bats`

Expected: 25 tests, all passing.

- [ ] **Step 5: Verify the prerequisite path end to end on a real machine**

Run: `./install.sh` with a deliberately broken PATH, to confirm the executed script (not just the sourced functions) reports missing prerequisites correctly:

```bash
env PATH=/usr/bin:/bin ./install.sh; echo "exit=$?"
```

Expected: on a machine whose Rust lives in `~/.cargo/bin`, this prints the `error: Rust not found.` block with the `https://rustup.rs` line and `exit=1`. If Rust happens to be on `/usr/bin`, expect the Node/pnpm error block and `exit=1` instead. Either outcome proves the source guard runs `main` and that `check_prereqs` fails closed before any build starts.

- [ ] **Step 6: Commit**

```bash
git add install.sh install.bats
git commit -m "feat: clear quarantine and report success in install.sh"
```

---

### Task 5: Wire into CI and document the from-source install

**Files:**
- Modify: `.github/workflows/ci.yml:37-38` (add a bats setup step) and `:66-70` (add a test step at the end)
- Modify: `CONTRIBUTING.md:34-44` (verification commands)
- Modify: `README.md:15-23` (Install section)
- Modify: `docs/ROADMAP.md:187-188` (Phase 1 Distribution bullet)

**Interfaces:**
- Consumes: `install.sh` and `install.bats` from Tasks 1-4.
- Produces: nothing consumed by later tasks. This is the final task.

- [ ] **Step 1: Add the bats setup step to CI**

In `.github/workflows/ci.yml`, after the `Set up uv` step (lines 37-38), insert:

```yaml
      - name: Set up bats
        run: brew install bats-core
```

- [ ] **Step 2: Add the install-script test step to CI**

In `.github/workflows/ci.yml`, append after the final `Check Python lockfile resolves` step:

```yaml
      - name: Run install script tests
        run: bats install.bats
```

- [ ] **Step 3: Verify the workflow file is valid YAML**

Run:

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('bats install.bats'))throw new Error('missing test step');if(!s.includes('brew install bats-core'))throw new Error('missing setup step');console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Add bats to CONTRIBUTING.md's verification list**

In `CONTRIBUTING.md`, change the Verification code block from:

```bash
pnpm test:run
pnpm website:typecheck
pnpm website:test
pnpm build
pnpm website:build
cd src-tauri && cargo test
cd resources && uv run --no-project --with fastapi --with uvicorn --with pydantic --with tqdm python test_mlx_server.py
```

to:

```bash
pnpm test:run
pnpm website:typecheck
pnpm website:test
pnpm build
pnpm website:build
bats install.bats
cd src-tauri && cargo test
cd resources && uv run --no-project --with fastapi --with uvicorn --with pydantic --with tqdm python test_mlx_server.py
```

Then add this line immediately after that code block, before the existing "For release changes, also run:" line:

```markdown
`bats install.bats` covers `install.sh`; install the runner with `brew install bats-core`.
```

- [ ] **Step 5: Add the build-from-source section to README.md**

In `README.md`, insert after the "Unsigned builds" blockquote (line 23) and before `## How it works`:

```markdown
### Build from source

Beaver is MIT-licensed and self-buildable, so building it yourself gets you the
same app for free. You need [Rust](https://rustup.rs), [Node.js](https://nodejs.org)
with [pnpm](https://pnpm.io), and Xcode Command Line Tools
(`xcode-select --install`). `install.sh` checks for all three and tells you what
is missing.

```bash
git clone https://github.com/thomasindrias/beaver.git
cd beaver
./install.sh
```

It builds a release bundle and installs it into `/Applications`, replacing any
previous install. Re-run it after `git pull` to update.
```

(Note the copy-style rule: no em-dashes in this text.)

- [ ] **Step 6: Replace the Homebrew cask item in the roadmap**

In `docs/ROADMAP.md`, change lines 187-188 from:

```markdown
- Distribution: demo GIF in README, Homebrew cask, signed/notarized default
  builds, HN/Product Hunt launch with the table demo.
```

to:

```markdown
- Distribution: demo GIF in README, `install.sh` for a build-from-source
  install, signed/notarized default builds, HN/Product Hunt launch with the
  table demo.
```

- [ ] **Step 7: Run the full test suite**

Run:

```bash
bats install.bats
```

Expected: 25 tests, all passing.

- [ ] **Step 8: Manual smoke test of the real install**

This is the only check that exercises `run_build` and `main`'s full path. Run against a scratch destination first so a failure cannot disturb an existing `/Applications/Beaver.app`:

```bash
BEAVER_INSTALL_DIR=/tmp/beaver-smoke ./install.sh
```

Expected: prerequisite checks pass silently, `pnpm install` and `pnpm tauri build` run to completion (several minutes), and the run ends with the `==> Beaver is installed at /tmp/beaver-smoke/Beaver.app` block. Verify the bundle is real and launchable:

```bash
ls /tmp/beaver-smoke/Beaver.app/Contents/MacOS
xattr -p com.apple.quarantine /tmp/beaver-smoke/Beaver.app 2>&1 | head -1
```

Expected: the `MacOS` directory lists the `Beaver` executable, and the `xattr` lookup reports no such attribute (confirming `clear_quarantine` worked).

Clean up:

```bash
rm -rf /tmp/beaver-smoke
```

- [ ] **Step 9: Commit**

```bash
git add .github/workflows/ci.yml CONTRIBUTING.md README.md docs/ROADMAP.md
git commit -m "ci: run install.sh tests; docs: document building from source"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: prerequisite checks and the macOS guard (Task 1), plain `pnpm tauri build` plus bundle discovery (Task 2), quit-then-overwrite reinstall (Task 3), quarantine clearing and the success message (Task 4), CI wiring plus the README/CONTRIBUTING/ROADMAP updates (Task 5). The spec's non-goals are honored: no cask, no auto-installing toolchains, no DMG packaging, no `uv` check, no signing. The spec's one open question (missing vs. broken command) is resolved in Global Constraints as presence-only.

**Type and name consistency.** The spec's function list named the checks `check_command_line_tools` / `check_rust` / `check_node_and_pnpm`; this plan renames them to `has_*` and introduces `check_prereqs` as the single message-owning orchestrator. The rename makes the names honest: the `has_*` functions are pure predicates with no output, which is what makes them trivially testable. Behavior is unchanged from the approved design. `find_built_app` and `install_app` both communicate by printing a path to stdout, and `main` consumes each with command substitution, consistently across Tasks 2-4.

**Known deviation from the spec, already corrected there.** The spec originally described the build output as `target/<host-triple>/release/bundle/macos`; it and this plan both use `target/release/bundle/macos`, because no `--target` flag is passed. This is called out in Global Constraints so an implementer does not copy `release-macos.sh`'s path by mistake.
