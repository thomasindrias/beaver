#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load gitignored release credentials if present. Tests can disable this to keep
# release mode assertions independent from a developer's local signing setup.
if [[ "${BEAVER_SKIP_RELEASE_ENV:-}" != "1" && -f .env.release ]]; then
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

# 1. Build the .app UNSIGNED. We sign everything ourselves below so the bundled
#    `uv` helper (which Tauri leaves ad-hoc / linker-signed) gets a proper
#    Developer ID + hardened-runtime + timestamped signature. Unset every Apple
#    credential for this step so Tauri neither signs the main binary nor tries to
#    notarize prematurely (it would notarize before `uv` is signed and fail).
#    The DMG is packaged headlessly by dmgbuild — Tauri's DMG bundler drives
#    Finder via AppleScript, which can't run while logged out.
env -u APPLE_SIGNING_IDENTITY -u APPLE_ID -u APPLE_PASSWORD -u APPLE_TEAM_ID \
    -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH \
    pnpm tauri build --target "$TARGET"

BUNDLE="src-tauri/target/${TARGET}/release/bundle"
APP="$(/usr/bin/find "$BUNDLE/macos" -maxdepth 1 -name '*.app' 2>/dev/null | head -1)"
if [[ -z "$APP" ]]; then
  echo "error: no .app found under $BUNDLE/macos" >&2
  exit 1
fi

# 1a. Sign the app inside-out (signed mode only). Every nested Mach-O binary —
#     notably the bundled `uv` helper, which Tauri ships ad-hoc — must carry a
#     Developer ID signature with hardened runtime (--options runtime) and a
#     secure timestamp (--timestamp), or notarization rejects the whole app.
#     Sign the nested binaries first, then seal the .app last with entitlements.
if [[ "$MODE" == "signed" ]]; then
  echo "==> Signing nested Mach-O binaries (hardened runtime, timestamped)"
  while IFS= read -r macho; do
    echo "    sign: ${macho#"$APP"/}"
    codesign --force --options runtime --timestamp \
      --sign "$APPLE_SIGNING_IDENTITY" "$macho"
  done < <(find "$APP" -type f -exec sh -c 'file "$1" | grep -q "Mach-O"' _ {} \; -print)

  echo "==> Sealing the .app (entitlements, hardened runtime, timestamped)"
  codesign --force --options runtime --timestamp \
    --entitlements src-tauri/entitlements.plist \
    --sign "$APPLE_SIGNING_IDENTITY" "$APP"

  codesign --verify --deep --strict --verbose=2 "$APP"
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
  xcrun stapler staple "$APP"

  echo "==> Verifying signature, Gatekeeper, and notarization staple"
  codesign --verify --deep --strict --verbose=2 "$APP"
  spctl -a -t open --context context:primary-signature -vvv "$DMG"
  xcrun stapler validate "$DMG"
fi

# 4. Updater artifacts: tar.gz of the (signed, stapled) .app plus a minisign
#    signature and the latest.json manifest the in-app updater consumes.
#    Gated on the updater key — local test builds without it skip this and
#    ship a DMG only. The tarball is built AFTER codesigning/stapling so the
#    updater distributes exactly the bytes the DMG carries.
if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "==> Building updater artifacts"
  if [[ "$MODE" == "unsigned" ]]; then
    echo "!!  Updater key set but build is UNSIGNED — the updater would ship an un-notarized app."
  fi
  UPDATER_DIR="$BUNDLE/updater"
  mkdir -p "$UPDATER_DIR"
  TARBALL="$UPDATER_DIR/Beaver_${VERSION}_aarch64.app.tar.gz"
  rm -f "$TARBALL" "$TARBALL.sig" "$UPDATER_DIR/latest.json"
  tar -czf "$TARBALL" -C "$(dirname "$APP")" "$(basename "$APP")"

  pnpm tauri signer sign "$TARBALL" --password "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

  TAG="${BEAVER_RELEASE_TAG:-v${VERSION}}"
  if [[ "$TAG" != "v${VERSION}" ]]; then
    echo "!!  Tag ${TAG} does not match package version v${VERSION} — latest.json will self-heal via fallback, but check your dispatch input."
  fi
  ASSET_URL="https://github.com/thomasindrias/beaver/releases/download/${TAG}/$(basename "$TARBALL")"
  node -e '
    const fs = require("fs");
    const [version, sigPath, url, out] = process.argv.slice(1);
    fs.writeFileSync(out, JSON.stringify({
      version,
      pub_date: new Date().toISOString(),
      platforms: { "darwin-aarch64": { signature: fs.readFileSync(sigPath, "utf8").trim(), url } },
    }, null, 2) + "\n");
  ' "$VERSION" "$TARBALL.sig" "$ASSET_URL" "$UPDATER_DIR/latest.json"
  echo "==> Updater artifacts in $UPDATER_DIR"
fi

echo "==> Done (${MODE}). DMG: ${DMG}"
