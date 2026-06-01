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

TARGET="aarch64-apple-darwin"
MODE="$(print_mode)"
echo "==> Beaver release (mode: ${MODE}, target: ${TARGET})"
if [[ "$MODE" == "unsigned" ]]; then
  echo "!!  No APPLE_SIGNING_IDENTITY — building an UNSIGNED DMG."
  echo "!!  First launch needs right-click > Open. Add creds to .env.release to notarize."
fi

# 1. Build the .app. Tauri signs it when APPLE_SIGNING_IDENTITY is set.
#    The DMG itself is packaged below by dmgbuild — Tauri's DMG bundler drives
#    Finder via AppleScript, which can't run headless / while logged out.
pnpm tauri build --target "$TARGET"

BUNDLE="src-tauri/target/${TARGET}/release/bundle"
APP="$(/usr/bin/find "$BUNDLE/macos" -maxdepth 1 -name '*.app' 2>/dev/null | head -1)"
if [[ -z "$APP" ]]; then
  echo "error: no .app found under $BUNDLE/macos" >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
DMG_DIR="$BUNDLE/dmg"
DMG="${DMG_DIR}/Beaver_${VERSION}_${TARGET%%-*}.dmg"
mkdir -p "$DMG_DIR"
rm -f "$DMG"

# 2. Compose a HiDPI background (1x + @2x) so it stays crisp on retina displays.
BG_TIFF="${DMG_DIR}/background.tiff"
tiffutil -cathidpicheck \
  src-tauri/dmg/background.png \
  src-tauri/dmg/background@2x.png \
  -out "$BG_TIFF" >/dev/null

# 3. Package the branded DMG headlessly (writes .DS_Store directly; no Finder).
echo "==> Packaging branded DMG with dmgbuild"
BEAVER_APP="$APP" \
BEAVER_DMG_BG="$BG_TIFF" \
BEAVER_VOLICON="src-tauri/icons/icon.icns" \
  uv run --no-project --with dmgbuild -- \
    dmgbuild -s scripts/dmgbuild-settings.py "Beaver" "$DMG"

if [[ "$MODE" == "signed" ]]; then
  echo "==> Signing DMG"
  codesign --force --sign "$APPLE_SIGNING_IDENTITY" "$DMG"

  echo "==> Submitting DMG for notarization (this can take a few minutes)"
  if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
    xcrun notarytool submit "$DMG" \
      --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" \
      --wait
  else
    xcrun notarytool submit "$DMG" \
      --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" \
      --wait
  fi
  xcrun stapler staple "$DMG"

  echo "==> Verifying signature, Gatekeeper, and notarization staple"
  codesign --verify --deep --strict --verbose=2 "$APP"
  spctl -a -t open --context context:primary-signature -vvv "$DMG"
  xcrun stapler validate "$DMG"
fi

echo "==> Done (${MODE}). DMG: ${DMG}"
