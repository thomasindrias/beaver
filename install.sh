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

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
