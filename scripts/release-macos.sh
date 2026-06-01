#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load gitignored release credentials if present.
if [[ -f .env.release ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.release
  set +a
fi

print_mode() {
  if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then echo "signed"; else echo "unsigned"; fi
}

if [[ "${1:-}" == "--print-mode" ]]; then
  print_mode
  exit 0
fi

MODE="$(print_mode)"
echo "==> Beaver release (mode: ${MODE}, target: aarch64-apple-darwin)"
if [[ "$MODE" == "unsigned" ]]; then
  echo "!!  No APPLE_SIGNING_IDENTITY — building an UNSIGNED DMG."
  echo "!!  First launch needs right-click > Open. Add creds to .env.release to notarize."
fi

pnpm tauri build --target aarch64-apple-darwin

BUNDLE="src-tauri/target/aarch64-apple-darwin/release/bundle"
APP="$(/usr/bin/find "$BUNDLE/macos" -maxdepth 1 -name '*.app' 2>/dev/null | head -1)"
DMG="$(/usr/bin/find "$BUNDLE/dmg" -maxdepth 1 -name '*.dmg' 2>/dev/null | head -1)"

if [[ "$MODE" == "signed" ]]; then
  echo "==> Verifying signature, Gatekeeper, and notarization staple"
  codesign --verify --deep --strict --verbose=2 "$APP"
  spctl -a -t exec -vvv "$APP"
  xcrun stapler validate "$DMG"
fi

echo "==> Done (${MODE}). DMG: ${DMG:-<none>}"
