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

# `pnpm tauri build` is run with no --target, so cargo does NOT nest output
# under a target-triple directory the way scripts/release-macos.sh's output is.
BUNDLE_SUBPATH="src-tauri/target/release/bundle/macos"

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

# /Applications exists on every Mac. A custom BEAVER_INSTALL_DIR may not exist
# yet, in which case install_app's `mkdir -p` is what will create it, so a
# missing directory is not a failure here.
has_writable_install_dir() {
  local dir="${BEAVER_INSTALL_DIR:-/Applications}"
  [[ ! -e "$dir" ]] || [[ -w "$dir" ]]
}

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
    echo "  If you just installed it, open a new terminal first." >&2
    echo "  Then re-run this script." >&2
    return 1
  fi
  if ! has_node_and_pnpm; then
    echo "error: Node.js and pnpm are required." >&2
    echo "  Install Node.js from https://nodejs.org and pnpm from https://pnpm.io" >&2
    echo "  If you just installed it, open a new terminal first." >&2
    echo "  Then re-run this script." >&2
    return 1
  fi
  if ! has_writable_install_dir; then
    echo "error: ${BEAVER_INSTALL_DIR:-/Applications} is not writable." >&2
    echo "  Install to your home folder instead:" >&2
    echo "    BEAVER_INSTALL_DIR=\"\$HOME/Applications\" ./install.sh" >&2
    echo "  Or re-run from an account with admin rights." >&2
    return 1
  fi
}

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

quit_running_app() {
  # A failure here is the normal case on a first install (nothing to quit), so
  # it never propagates. But a quit can also be refused (Automation permission
  # not granted, or no GUI session over SSH), which is worth reporting: the
  # bundle gets replaced under a live process and the old build keeps running.
  osascript -e 'quit app "Beaver"' >/dev/null 2>&1 || true
  if pgrep -x Beaver >/dev/null 2>&1; then
    echo "note: Beaver is still running. Quit it and relaunch from Applications to get the new build." >&2
  fi
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

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
