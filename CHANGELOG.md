# Changelog

All notable changes to Beaver are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-07-20

### Added
- Intel Mac support: Beaver ships a signed, notarized `x86_64` DMG
  alongside the existing Apple Silicon build, running a local llama.cpp
  vision engine (MiniCPM-V 2.6) in place of MLX. Same install flow, same
  in-app update path — the updater automatically serves the right
  architecture.

### Changed
- The release pipeline now builds and publishes both architectures from a
  single workflow dispatch, with one merged updater manifest covering both.

## [0.1.1] — 2026-07-16

### Added
- Anchored capture HUD: the result pill now docks to the selection with
  format chips (Markdown / Table-CSV / JSON / plain), a custom formatting
  hint, a full Tab keyboard lap, and in-place retry for errors.
- `re_extract` command re-runs the last capture with a new format or hint
  without re-shooting the screen.
- One-click in-app updates: the update pill now downloads, verifies, and
  installs new releases in place (restart to finish). Falls back to opening
  the release page when a release has no updater assets.

### Changed
- The cursor-following toast is retired in favor of the anchored HUD.
- Re-rendered formats update the clipboard; history keeps the first
  extraction of each capture.

## [0.1.0] — 2026-07-04

First public release.

- Menu-bar capture: `Cmd+Shift+D`, drag a region, get clean Markdown on the clipboard.
- Fully on-device vision (Qwen2.5-VL-3B via MLX); captures never leave the Mac.
- Capture history in the menu-bar popover (local SQLite).
- Guided onboarding: model download with progress, Screen Recording permission flow, setup retry with clear failure reasons.
- Passive update notice in the popover (checks GitHub Releases at most daily; disable with `BEAVER_DISABLE_UPDATE_CHECK=1`).
- Diagnosable failures: app and model-server logs in `~/Library/Logs/se.djtl.beaver/`.

[0.1.0]: https://github.com/thomasindrias/beaver/releases/tag/v0.1.0
