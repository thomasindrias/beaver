# macOS DMG Distribution — Design

**Date:** 2026-06-01
**Status:** Approved (pending spec review)

## Goal

Produce a branded, signed, and notarized `Beaver.dmg` with a single command. A
user downloads the DMG, opens it, drags **Beaver** into **Applications**, and
launches it with zero Gatekeeper friction.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Distribution format | DMG with drag-to-Applications layout |
| Code signing | Apple Developer ID Application + notarization |
| Build location | Local script on Thomas's Mac (no CI this round) |
| Auto-update | No (out of scope) |
| App icon | Rebrand to the beaver-head mark |
| DMG window | Branded minimal (dark palette, beaver head + wordmark, arrow) |
| Signing rollout | Build the full pipeline now with signing **wired but off**; flip on once the Developer ID cert exists |

## Target & constraints

- **Apple Silicon only** — build target `aarch64-apple-darwin`. The app bundles
  the MLX vision server (`resources/mlx_server.py` via the `uv` binary); MLX is
  Apple-Silicon-only, so an Intel/universal build would be dead weight.
- `bundle.macOS.minimumSystemVersion` set to `"13.0"` as a floor. **Verify against
  MLX's actual minimum during implementation** (likely 13.5+) and raise if needed.
- Hardened runtime + the existing `entitlements.plist`
  (`cs.disable-library-validation`, `cs.allow-jit`,
  `cs.allow-unsigned-executable-memory`, `screen-recording`) are already correct
  for notarizing an app that spawns a Python subprocess. No entitlement changes.
- `Info.plist` (`LSUIElement`, `NSScreenRecordingUsageDescription`) unchanged.

## The signing prerequisite (known gap)

The Keychain currently holds only an **"Apple Development"** certificate
(`THOMAS INDRIAS BINIAM (Z7HLVJ93DA)` — `Z7HLVJ93DA` is the Team ID). That cert
cannot notarize a downloadable app. A **"Developer ID Application"** certificate
is required, which needs a paid Apple Developer Program membership and must be
created/downloaded separately.

This does **not** block any build work below. The script runs in two modes and
defaults to unsigned until credentials are present.

## Components

### 1. Tauri bundle config (`src-tauri/tauri.conf.json`)

> **Update (2026-06-01, during implementation):** Tauri's built-in `dmg` target
> drives Finder via AppleScript to lay out the window, which fails non-interactively
> (`AppleEvent timed out (-1712)` — the build ran while no one could approve the
> Finder automation prompt). DMG packaging was therefore moved out of Tauri to
> **`dmgbuild`** (see Component 4), which writes the `.DS_Store` layout directly
> with no Finder dependency. Net effect: `targets` is `["app"]` only, and the
> `bundle.macOS.dmg` block is removed (its window/background/icon-position settings
> now live in `scripts/dmgbuild-settings.py`).

Tighten the macOS bundle to build just the signed `.app`:

```jsonc
"bundle": {
  "targets": ["app"],                 // was "all"; DMG packaged by dmgbuild
  "macOS": {
    "minimumSystemVersion": "13.0",
    "entitlements": "entitlements.plist",
    "infoPlist": "Info.plist"
  }
}
```

- `signingIdentity` is **not** hardcoded. Signing is driven by the
  `APPLE_SIGNING_IDENTITY` env var so the same config builds signed or unsigned.
- `targets` narrowed to `["app"]` to skip irrelevant bundle types; the DMG is a
  separate headless step.

### 2. App icon rebrand

- Source: a 1024×1024 PNG of the beaver head centered on a branded rounded-square
  ("squircle") so the Dock/Finder icon looks native (free-floating cutouts look
  non-native). Generated from the existing high-res transparent head art.
- Run `pnpm tauri icon <source.png>` to regenerate every entry under
  `src-tauri/icons/` (`icon.icns`, `icon.ico`, all PNG sizes).
- The menu-bar tray icon (`tray.png`) is **out of scope** — already branded.

### 3. DMG appearance (branded minimal)

A generated background image at `src-tauri/dmg/background.png` (and `@2x` for
retina, 1320×840):

- Dark `#1a1714` background (app palette).
- Beaver head (~48px) + "Beaver" wordmark, top-left, with a thin divider beneath.
- A right-pointing arrow drawn between the app-icon slot (x≈180) and the
  Applications slot (x≈480), vertically centered at y≈210.
- Caption near the bottom: "Drag Beaver into your Applications folder."

Generated programmatically with Pillow (the project's existing asset toolchain).
Icon positions in the config align to the arrow endpoints.

### 4. Release script (`scripts/release-macos.sh`, alias `pnpm release:mac`)

A single orchestrator with two modes, auto-selected by credential presence:

1. Load `.env.release` if it exists (sets `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
   `APPLE_PASSWORD`, `APPLE_TEAM_ID`, **or** `APPLE_API_KEY` / `APPLE_API_ISSUER`
   / `APPLE_API_KEY_PATH`).
2. Detect mode:
   - **Signed mode** — `APPLE_SIGNING_IDENTITY` set → Tauri signs the `.app`; the
     script then signs the DMG, notarizes with `notarytool --wait`, and staples.
   - **Unsigned mode** — no identity → build an unsigned (ad-hoc) DMG for local
     testing of the full flow today. Print a clear banner stating it's unsigned.
3. Run `pnpm tauri build --target aarch64-apple-darwin` (builds + signs the `.app`).
4. **Package the branded DMG headlessly** — compose a HiDPI background
   (`tiffutil -cathidpicheck` of the 1x + @2x PNGs) and run
   `dmgbuild -s scripts/dmgbuild-settings.py` via `uv run --with dmgbuild`. This
   writes the window layout (`.DS_Store`) directly — no Finder, works in CI.
5. **Verify the artifact** (signed mode only, fail loudly on any miss):
   - `codesign --verify --deep --strict --verbose=2 <app>`
   - `spctl -a -t open --context context:primary-signature -vvv <dmg>` (Gatekeeper)
   - `stapler validate <dmg>` (notarization ticket stapled)
6. Print the final DMG path and the mode it ran in.

The DMG layout (`scripts/dmgbuild-settings.py`) reads the app path, background, and
volume icon from env vars set by the script, defines the `Applications` drop-link,
and positions the app icon (180, 210) and Applications (480, 210) to match the
background art.

### 5. Credentials handling

- `.env.release.example` (committed) documents every required variable with
  inline comments and both notarization methods.
- `.env.release` (real secrets) is **gitignored**. Verify `.gitignore` covers it.
- No secret is ever written to a tracked file.

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/tauri.conf.json` | Modify | DMG block, target, min version |
| `src-tauri/icons/*` | Regenerate | Beaver-head app icon, all sizes |
| `src-tauri/dmg/background.png` (+`@2x`) | Create | Branded DMG background |
| `scripts/gen-dmg-background.py` | Create | Deterministic background generator |
| `scripts/release-macos.sh` | Create | Build → sign → notarize → verify |
| `.env.release.example` | Create | Documents required credentials |
| `.gitignore` | Modify | Ignore `.env.release` |
| `package.json` | Modify | `release:mac` script |
| `README.md` | Modify | Short "Install" section |

## Verification & testing

Build pipelines don't fit TDD cleanly; verification is built into the artifacts:

- **Script self-checks:** the `codesign` / `spctl` / `stapler` gates above (signed
  mode) cause a non-zero exit if the installer would ship broken.
- **Deterministic asset checks:** assert the generated background exists at the
  expected dimensions (660×420 / 1320×840) and that `tauri icon` produced
  `icon.icns`. A small test can assert the background generator's output size.
- **Manual acceptance (final):** on Thomas's Mac — build unsigned DMG now, open
  it, drag Beaver → Applications, launch, confirm it runs. Repeat in signed mode
  once the Developer ID cert is installed, confirming **no Gatekeeper warning**.

## Prerequisites (Thomas provides, before the first *signed* build only)

- A **Developer ID Application** certificate in the login Keychain (requires paid
  Apple Developer Program membership).
- Team ID (`Z7HLVJ93DA`, to confirm).
- Notarization credentials: an app-specific password (Apple ID method) **or** an
  App Store Connect API key `.p8` (API-key method).

These drop into `.env.release`; nothing else changes.

## Non-goals (this round)

- In-app auto-update (Tauri updater).
- CI/CD (GitHub Actions) release automation.
- Intel / universal builds.
- A hosted download page / website integration.
- Menu-bar tray icon changes.
