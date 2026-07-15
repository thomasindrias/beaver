# Changelog

All notable changes to Beaver are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added
- Anchored capture HUD: the result pill now docks to the selection with
  format chips (Markdown / Table-CSV / JSON / plain), a custom formatting
  hint, a full Tab keyboard lap, and in-place retry for errors.
- `re_extract` command re-runs the last capture with a new format or hint
  without re-shooting the screen.

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
