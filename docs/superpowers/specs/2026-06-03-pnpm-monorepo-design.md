# pnpm Monorepo Refactor Design

**Date:** 2026-06-03
**Status:** Approved

## Goal

Refactor Beaver into a clean pnpm/Turborepo monorepo that keeps the desktop app
and marketing website independently understandable, removes demonstrated
duplication, and preserves the existing desktop development and release
workflows.

## Locked Decisions

| Decision | Choice |
|----------|--------|
| Repository layout | Move both apps under `apps/` |
| Workspace manager | pnpm workspace with one root lockfile |
| Task orchestration | Turborepo for local task orchestration and caching |
| Shared package split | Focused `@beaver/brand` and `@beaver/ui` packages |
| Shared code scope | Brand data, shared assets, `BrandMark`, and `cn` |
| Visual themes | Desktop and website themes remain distinct |
| Asset delivery | Canonical assets in `packages/brand`, synced to app `public/` directories |
| Synced asset copies | Committed and verified against the canonical source |
| Root `pnpm dev` | Start the Vite desktop frontend and Next.js website |
| Native desktop development | Preserve `pnpm tauri dev` as an explicit root alias |
| Desktop release | Preserve `pnpm release:mac` as an explicit root alias |

## Architecture

The repository becomes a pnpm workspace with two applications and two focused
shared packages:

```text
apps/
  desktop/                  Vite React frontend, Tauri Rust shell, release tooling
  website/                  Next.js marketing site
packages/
  brand/                    Framework-neutral brand metadata and canonical assets
  ui/                       Small React primitives shared by both apps
```

The repository root owns workspace orchestration only: the root
`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, shared
dependency version policy, and documentation. Product code lives in an app or
package.

`@beaver/brand` has no React dependency. It exports stable product metadata,
external links, and public asset paths. `@beaver/ui` depends on
`@beaver/brand` and initially exports only the demonstrated shared React
surface: `BrandMark` and `cn`.

The desktop and website apps remain separate products with different runtime
constraints:

- The desktop app continues to use Vite, Tauri, desktop-specific Tailwind
  tokens, native IPC, and local release tooling.
- The website continues to use Next.js, static export, website-specific
  Tailwind tokens, and marketing components.
- App-specific components stay local even when they have similar names. The
  shared packages do not become a second design system.

## Workspace Layout

### Root

The root `package.json` is private and contains Turbo scripts, desktop
compatibility aliases, focused app aliases, the `turbo` development dependency,
and the pinned pnpm package manager version. It does not carry the Beaver
desktop product version.

`pnpm-workspace.yaml` includes `apps/*` and `packages/*`. It also defines a
small catalog for dependency versions that must remain aligned across the
workspace, including React, React DOM, TypeScript, Vitest, Tailwind CSS, and
the shared utility dependencies.

`turbo.json` defines:

- `dev` as persistent and uncached.
- `build` as dependency-aware with app/package output globs.
- `test:run` and `typecheck` as dependency-aware verification tasks.

Root development, build, native desktop, and release aliases synchronize
canonical assets before invoking their underlying task. Workspace tests verify
that committed public copies have not drifted.

Remote caching and deployment configuration are out of scope.

### `apps/desktop`

The current repository-root desktop app moves into `apps/desktop`, including:

- `src/`, `public/`, `index.html`, Vite and TypeScript configuration.
- `src-tauri/` and its Rust, Python, resource, icon, and DMG files.
- `scripts/`, `.env.release.example`, `components.json`, and desktop tests.
- The current desktop package metadata and version.

Tauri configuration remains beside its frontend. Its `beforeDevCommand`,
`beforeBuildCommand`, and `frontendDist` paths continue to resolve within the
desktop app directory. The macOS release script resolves its own app root
instead of assuming the repository root.

### `apps/website`

The existing untracked `website/` app moves into `apps/website` without a
visual redesign. Its Next.js configuration transpiles `@beaver/brand` and
`@beaver/ui`, and points Turbopack at the monorepo root so local workspace
packages resolve consistently.

Website-only media such as demo recordings, the poster image, and Open Graph
image stay owned by the website.

### `packages/brand`

`@beaver/brand` is the framework-neutral source of truth for:

- Product name and stable descriptive metadata.
- GitHub repository and release download URLs.
- Shared public asset paths.
- Canonical shared asset files.

Only assets used by both applications belong here:

- `beaver-head.webp`
- `favicon.ico`

Desktop-only mood animations, including the wave animation, stay in
`apps/desktop/public`. The website's currently unused wave copy is removed.
Website-only media stays in `apps/website/public`.

### `packages/ui`

`@beaver/ui` is a small source package consumed directly by Vite and transpiled
by Next.js. It exports:

- `BrandMark`, rendered as a normal `<img>` using the shared brand asset path.
- `cn`, the existing `clsx` plus `tailwind-merge` helper.

Both app stylesheets explicitly register `packages/ui/src` as a Tailwind v4
source so shared component utility classes are included in production CSS.

Each app keeps a local `Logo` wrapper:

- Desktop retains its size, live pulse animation, and decorative semantics.
- Website retains its wordmark, Next.js layout behavior, and theme-specific
  classes.

Buttons, headings, Tailwind tokens, and other app-specific UI are not shared in
this refactor.

## Asset Synchronization

Canonical shared files live under `packages/brand/assets/`. A root-owned sync
script copies them into the matching paths under each app's `public/`
directory.

The copied files remain committed for three reasons:

1. Fresh checkouts can run either app without a preparatory generation step.
2. Next.js static export and Tauri builds keep ordinary public URLs.
3. Reviewers can see asset changes in the application artifact paths.

A verification script or test compares the canonical files to every committed
copy and fails when they drift. Build and verification tasks run asset
synchronization or verification explicitly so local development and CI cannot
silently ship stale copies.

## Commands

The root command pattern is:

```text
pnpm dev          Start the desktop Vite frontend and Next.js website
pnpm build        Build all buildable workspace packages and apps
pnpm test:run     Run all workspace tests once
pnpm typecheck    Type-check all TypeScript packages and apps
pnpm tauri dev    Start the native Tauri desktop app
pnpm release:mac  Run the desktop macOS release workflow
```

Focused aliases are also available for one-app work, using a consistent
`desktop:*` and `website:*` pattern, such as:

```text
pnpm desktop:dev
pnpm desktop:test
pnpm website:dev
pnpm website:test
```

The compatibility aliases use pnpm filters instead of relying on the current
working directory. Arguments after `--` continue to pass through, including
`pnpm release:mac -- --print-mode`.

## Migration Requirements

The move must update every path-sensitive integration rather than relying on
the old repository-root layout:

- Tauri `frontendDist` and build command assumptions.
- macOS release script package version, bundle paths, and workspace-root
  `.env.release` compatibility.
- DMG background generator input and output paths.
- Desktop tests that read `package.json`, `src-tauri`, scripts, or assets.
- README development, testing, build, release, and project-layout commands.
- Website comments and tests that refer to the old `website/public` path.
- Root and app `.gitignore` coverage.

The migration produces one root `pnpm-lock.yaml`. The current root lockfile and
website lockfile are replaced by the workspace lockfile generated from all
workspace package manifests.

## Verification

Automated verification must demonstrate:

- One root `pnpm install` installs all workspace dependencies and produces one
  lockfile.
- Workspace configuration includes both apps and both shared packages.
- `@beaver/brand` exports the expected metadata and asset paths.
- `@beaver/ui` renders `BrandMark` and provides `cn`.
- Committed public asset copies match the canonical files.
- Existing desktop frontend tests pass after their move.
- Existing website tests pass after their move.
- Desktop Tauri configuration and release script tests pass with their new
  paths.
- `pnpm build`, `pnpm test:run`, and `pnpm typecheck` pass through Turbo.
- `pnpm release:mac -- --print-mode` continues to report signed or unsigned
  mode without building a release.

Manual verification must demonstrate:

- `pnpm dev` starts both the Vite desktop frontend and the Next.js website.
- `pnpm tauri dev` still starts the native desktop application.

## Error Handling

Workspace scripts fail fast when a package task fails. Asset synchronization
reports the source and destination path for missing or mismatched files.
Compatibility aliases return the underlying desktop command exit status so
release and native build failures remain visible.

No task should mutate unrelated application assets or hide a missing canonical
asset by leaving an old committed copy in place.

## Non-Goals

- Splitting or refactoring the Rust `src-tauri/src/lib.rs` entrypoint.
- Refactoring the Python MLX server.
- Unifying desktop and website visual themes.
- Building a broad shared component library.
- Sharing app-specific Tailwind tokens or layout components.
- Adding remote Turbo caching, CI/CD, deployment, or release automation.
- Changing Beaver runtime behavior or the marketing website design.
