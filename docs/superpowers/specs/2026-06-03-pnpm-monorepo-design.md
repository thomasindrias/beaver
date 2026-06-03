# Beaver pnpm Monorepo Design

## Goal

Convert Beaver into a clean pnpm/Turbo monorepo centered on the existing
desktop app. Remove the current untracked website from scope; a real website
will be designed later after mockups.

## Decisions

| Topic | Decision |
| --- | --- |
| Website | Remove the current `website/`; do not create `apps/website` in this pass |
| Desktop app | Move the existing Vite/Tauri app to `apps/desktop` |
| Root dev pattern | `pnpm dev` runs every app under `apps/*` that has a `dev` task |
| Native app dev | `pnpm tauri dev` remains the explicit Tauri/native workflow |
| Shared packages | Add `@beaver/brand` and `@beaver/ui` only |
| Assets | Keep canonical shared brand assets in `packages/brand/assets` and sync public copies |
| Animations | Keep mood animations desktop-owned under `apps/desktop/public/beaver-animations` |
| Themes | Keep the desktop visual system unchanged |

## Target Layout

```text
apps/
  desktop/                  Existing Vite React frontend and Tauri shell
packages/
  brand/                    Framework-neutral product metadata and brand assets
  ui/                       Small shared React primitives
scripts/                    Workspace scripts, including release and asset sync
tests/                      Workspace-level configuration and asset tests
docs/                       Existing planning/spec documents
```

There is intentionally no website app in the target tree. A future website can
be added as `apps/website` with its own `package.json` and `dev` script; the
root `pnpm dev` pattern will pick it up without redesigning the workspace.

## Workspace

The repository root owns:

- `pnpm-workspace.yaml`
- `turbo.json`
- one root `pnpm-lock.yaml`
- dependency catalog versions
- root scripts and compatibility aliases
- workspace-level tests

Root scripts follow this contract:

```text
pnpm dev          Sync brand assets, then run dev tasks for all apps in apps/*
pnpm build        Sync assets, build shared packages, then build apps
pnpm test:run     Run workspace tests and package tests once
pnpm typecheck    Type-check packages and apps
pnpm tauri dev    Run the desktop app through Tauri
pnpm release:mac  Build the macOS release from the root
```

The first workspace contains one app, so `pnpm dev` starts the desktop Vite
frontend only. That is deliberate: Tauri/native dev stays opt-in through
`pnpm tauri dev`.

## Desktop App

The current root app moves to `apps/desktop` with the least behavior change
possible:

- React/Vite source remains under `apps/desktop/src`.
- Tauri Rust source remains under `apps/desktop/src-tauri`.
- Desktop public assets remain under `apps/desktop/public`.
- Desktop tests remain close to the desktop source under
  `apps/desktop/src/tests`.
- The desktop package is named `@beaver/desktop`.

Tauri config keeps its existing relative model: `src-tauri/tauri.conf.json`
still uses `../dist` for `frontendDist`, because the config remains one level
below the desktop app root.

## Release Script

The macOS release script stays a root-owned workflow at
`scripts/release-macos.sh`. It is updated to address the moved desktop paths:

- build through `pnpm --filter @beaver/desktop exec tauri build`
- read the app version from `apps/desktop/package.json`
- use `apps/desktop/src-tauri/...` for bundle, entitlement, DMG, and icon paths
- keep `scripts/dmgbuild-settings.py` at the root

Release credentials remain compatible with existing local state:

1. `BEAVER_RELEASE_ENV_FILE=/path/to/file` loads that exact file when set.
2. Otherwise root `.env.release` is used when present.
3. Otherwise `apps/desktop/.env.release` is accepted for app-local workflows.

Tests set `BEAVER_RELEASE_ENV_FILE=/dev/null` so checked-in tests are
deterministic even when a developer has real signing credentials at the root.

## Brand Package

`@beaver/brand` is framework-neutral and has no React dependency. It exports:

- product metadata such as `beaverProduct.name`
- public asset paths such as `brandAssets.head`
- shared external or support links when they become stable

Canonical files live under `packages/brand/assets`:

- `beaver-head.webp`
- `favicon.ico` copied from the existing Tauri icon source

The sync script copies those assets into app public directories. In this pass
the only app target is `apps/desktop/public`.

## UI Package

`@beaver/ui` starts intentionally small:

- `cn`, the existing `clsx` + `tailwind-merge` helper
- `BrandMark`, a plain React `<img>` wrapper for the shared mascot mark

The desktop app keeps its local `Logo` component, but it delegates the mark to
`BrandMark` so app-specific animation and accessibility choices stay local.

Desktop Tailwind CSS includes the package source explicitly:

```css
@source "../../../packages/ui/src";
```

That keeps Tailwind v4 aware of classes used by shared UI components.

## Asset Sync

The repository keeps checked-in public copies for predictable Vite and Tauri
behavior. A root script enforces the copy contract:

```text
pnpm sync:assets          Copy canonical brand assets into app public dirs
pnpm sync:assets --check  Fail if any public copy has drifted
```

The script is wired before root `dev`, `build`, `preview`, `tauri`, and release
commands. Workspace tests also check byte-for-byte equality.

Starter assets from the Vite/Tauri template are removed:

- `apps/desktop/public/vite.svg`
- `apps/desktop/public/tauri.svg`
- `apps/desktop/src/assets/react.svg`

Desktop mood animations remain where the app uses them.

## Documentation

The README is updated to show the monorepo layout and current commands. It
should not mention the removed website or top-level `src-tauri` paths except
when describing the old location in historical docs.

## Verification

The implementation is complete when these pass:

```text
pnpm install
pnpm sync:assets --check
pnpm test:run
pnpm typecheck
pnpm build
cd apps/desktop/src-tauri && cargo test
```

`pnpm dev` must start the desktop frontend through the workspace pattern, and
`pnpm tauri dev` must remain the explicit native app command.

## Out Of Scope

- Creating or preserving the old website
- Adding `apps/website`
- Redesigning the desktop UI
- Refactoring Rust or Python internals
- Changing Beaver capture, onboarding, model, database, or release behavior
