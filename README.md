# Beaver

A macOS menu-bar utility that turns a screenshot into structured data. Press a
shortcut, drag a box around anything on screen, and Beaver extracts what's
inside it as clean Markdown — tables stay tables, lists stay lists, code stays
code. Vision runs **fully on-device** after a one-time model download, so
captures never leave your machine.

> Apple Silicon only. The vision model runs on Apple's MLX framework, which
> requires an M-series Mac.

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
bar tracks the download; everything after runs offline.

## Stack

- **Shell:** [Tauri 2](https://tauri.app) (Rust core, macOS menu-bar app)
- **Frontend:** React 19 + TypeScript + Vite 7, Tailwind CSS v4, shadcn
- **Vision backend:** Python FastAPI + [MLX](https://github.com/ml-explore/mlx) (`mlx-vlm`)
- **Storage:** SQLite via `tauri-plugin-sql`

## Prerequisites

- macOS on Apple Silicon
- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) + [pnpm](https://pnpm.io)
- [uv](https://github.com/astral-sh/uv) — used to provision the Python vision environment

## Development

```bash
pnpm install
pnpm dev          # run all app dev servers; currently the desktop Vite frontend
pnpm tauri dev    # run the native macOS app
```

`pnpm dev` uses the workspace `apps/*` pattern. Today that starts the desktop
frontend only; a future website app can join by adding its own `dev` script.

## Testing

```bash
pnpm test:run
pnpm typecheck
cd apps/desktop/src-tauri && cargo test
# Python vision server:
cd apps/desktop/src-tauri/resources && \
  uv run --no-project --with fastapi --with uvicorn --with pydantic --with tqdm \
  python test_mlx_server.py
```

## Build

```bash
pnpm build
pnpm tauri build
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

## Project layout

```text
apps/
  desktop/                 React frontend and Tauri shell
    src/                   UI, hooks, and vitest specs
    src-tauri/             Rust core and MLX server resources
    public/                Desktop public assets and mood animations
packages/
  brand/                   Product metadata and canonical brand assets
  ui/                      Shared React primitives
scripts/                   Workspace automation and release scripts
tests/                     Workspace contract tests
```
