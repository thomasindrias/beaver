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

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
