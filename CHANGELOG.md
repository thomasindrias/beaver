# Changelog

All notable changes to Beaver are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-07-04

First public release.

- Menu-bar capture: `Cmd+Shift+D`, drag a region, get clean Markdown on the clipboard.
- Fully on-device vision (Qwen2.5-VL-3B via MLX); captures never leave the Mac.
- Capture history in the menu-bar popover (local SQLite).
- Guided onboarding: model download with progress, Screen Recording permission flow, setup retry with clear failure reasons.
- Passive update notice in the popover (checks GitHub Releases at most daily; disable with `BEAVER_DISABLE_UPDATE_CHECK=1`).
- Diagnosable failures: app and model-server logs in `~/Library/Logs/se.djtl.beaver/`.

[0.1.0]: https://github.com/thomasindrias/beaver/releases/tag/v0.1.0
