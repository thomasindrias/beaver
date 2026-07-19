# Beaver

A macOS menu-bar utility that turns a screenshot into structured data. Press a
shortcut, drag a box around anything on screen, and Beaver extracts what's
inside it as clean Markdown — tables stay tables, lists stay lists, code stays
code. Vision runs **fully on-device** after a one-time model download, so
captures never leave your machine.

> Apple Silicon only. The vision model runs on Apple's MLX framework, which
> requires an M-series Mac.

<!-- Demo assets: record with the capture flow + popover, save to docs/media/demo.gif, then uncomment.
![Beaver turning a screenshot region into Markdown](docs/media/demo.gif)
-->

## Install (macOS, Apple Silicon)

1. Download `Beaver_<version>_aarch64.dmg`.
2. Open the DMG and drag **Beaver** into **Applications**.
3. Launch Beaver from Applications. Grant Screen Recording permission when asked.

> Unsigned builds: the first launch needs right-click → **Open** (one time) to get
> past Gatekeeper. Signed/notarized builds open normally.

## How it works

1. `Cmd+Shift+D` opens a full-screen capture overlay.
2. You drag a bounding box around the region of interest.
3. The cropped image is sent to a local FastAPI server running
   `Qwen2.5-VL-3B-Instruct-4bit` via MLX.
4. The extracted Markdown is returned, stored in a local SQLite history, and
   copied to your clipboard.

On first launch Beaver downloads the ~3 GB vision model and prepares an
on-device Python environment (the only time it needs the internet). A progress
bar tracks the download; extraction then runs fully offline. The only later
network calls are update-related and go exclusively to GitHub:
an optional once-a-day version check against GitHub Releases, and — only when
you click the update pill — downloading the new release from the same place.
Updates are verified against a public key baked into the app before install
(no capture data, ever). Set `BEAVER_DISABLE_UPDATE_CHECK=1` to turn all of it
off.

## Stack

- **Shell:** [Tauri 2](https://tauri.app) (Rust core, macOS menu-bar app)
- **Frontend:** React 19 + TypeScript + Vite 7, Tailwind CSS v4, shadcn
- **Vision backend:** Python FastAPI + [MLX](https://github.com/ml-explore/mlx) (`mlx-vlm`)
- **Storage:** SQLite via `tauri-plugin-sql`

## Prerequisites

- macOS (Apple Silicon uses the MLX vision backend; Intel Macs can now build
  and run from source against a llama.cpp local engine — see
  `src-tauri/src/llamacpp.rs`. Packaged Intel releases aren't shipped yet.)
- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) + [pnpm](https://pnpm.io)
- [uv](https://github.com/astral-sh/uv) — used to provision the Python vision environment on Apple Silicon

## Development

```bash
pnpm install            # install frontend deps
pnpm tauri dev          # run the app (builds Rust + serves the frontend)
```

`pnpm dev` runs the Vite frontend alone (no native shell), which is handy for
UI-only work.

## Testing

```bash
pnpm test               # frontend (vitest, watch mode)
pnpm test:run           # frontend, single run
pnpm website:typecheck  # website TypeScript
pnpm website:test       # website vitest, single run
cargo test              # Rust (run inside src-tauri/)
# Python vision server:
cd src-tauri/resources && \
  uv run --no-project --with fastapi --with uvicorn --with pydantic --with tqdm \
  python test_mlx_server.py
```

## Build

```bash
pnpm build              # type-check + bundle the frontend
pnpm website:build      # build the landing page
pnpm tauri build        # produce the signed .app / .dmg
```

## Building a release

Requires Apple Silicon, Rust, and pnpm.

```bash
pnpm release:mac
```

Without credentials this produces an **unsigned** DMG for local testing. To sign
and notarize, copy `.env.release.example` to `.env.release`, fill in your Developer
ID identity and notarization credentials, and re-run. The script verifies the
signature, Gatekeeper acceptance, and notarization staple before finishing.

GitHub Actions includes:

- `CI` for frontend tests, website checks, Rust tests, and the Python server unit
  test.
- `Deploy Website` for publishing `apps/website` to GitHub Pages.
- `Release macOS` for manually building a DMG and optionally creating a draft
  GitHub release. It builds unsigned unless signing and notarization secrets are
  configured.

## Troubleshooting

- Logs live in `~/Library/Logs/se.djtl.beaver/` (`beaver.log` for the app,
  `engine-server.log` for the vision server). Attach both to bug reports.
- If captures return a permission message, enable Beaver under
  **System Settings → Privacy & Security → Screen Recording** and relaunch.
- If setup fails, the onboarding screen shows the reason and a **Try again**
  button; the menu-bar popover shows the same when Beaver is already set up.

## Security and Contributing

- See [SECURITY.md](SECURITY.md) for vulnerability reporting and the app security
  model.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and pull request
  expectations.
- Beaver is released under the [MIT License](LICENSE).

The macOS app requires screen capture and a bundled Python/MLX runtime. Keep
changes to Tauri permissions, hardened-runtime entitlements, and network
behavior narrow and documented.

## Project layout

```
src/                       React frontend
  components/              UI (capture overlay, onboarding, toast, …)
  hooks/                   useBeaver (capture flow), useCaptures (history)
  tests/                   vitest specs
src-tauri/                 Rust core
  src/
    lib.rs                 app setup, Tauri commands, window wiring
    capture.rs             screen capture + region crop
    server.rs              MLX server lifecycle (venv build, spawn, health)
    mlx.rs                 HTTP client for the vision server
    shortcut.rs            global shortcut binding
    db.rs                  SQLite schema + migrations
  resources/
    mlx_server.py          FastAPI vision server (Qwen2.5-VL via MLX)
public/
  beaver-animations/       per-mood beaver animations (WebP)
```
