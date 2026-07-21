# x86_64 DMG Release — Design Spec

**Date:** 2026-07-20
**Status:** Approved (design); pending spec review before planning
**Author:** Thomas Indrias / Claude

---

## Problem

Beaver's release pipeline (`.github/workflows/release-macos.yml`,
`scripts/release-macos.sh`) builds, signs, notarizes, and publishes exactly
one artifact: an `aarch64` DMG. The llama.cpp Intel Mac engine (merged in
[#6](https://github.com/thomasindrias/beaver/pull/6)) proved the local
vision engine works end-to-end on Intel — real CI verification, real
extraction, real hardware — but that work explicitly scoped out shipping it:
*"No x86_64 DMG publishing... This plan proves the engine works; shipping it
is a natural follow-up plan once validated."*

This spec is that follow-up: extend the release pipeline to also produce a
signed, notarized `x86_64` DMG, and actually publish it as part of a real
GitHub release alongside the existing `aarch64` one, with both entries in the
in-app updater's manifest.

---

## Goals

- A signed, notarized `x86_64` DMG, built and published the same way the
  existing `aarch64` DMG is — same trust level, same automation, no manual
  post-processing.
- Both architectures ship together under one version bump and one GitHub
  release; the in-app updater serves the right artifact to the right
  machine via a single `latest.json` with both platform entries.
- No new GitHub Actions secrets or credentials — reuse the existing Apple
  Developer ID certificate and Tauri updater minisign keypair, since neither
  is architecture-specific.
- Reasonable safety: if either architecture's build/sign/notarize fails, no
  partial release goes out (no DMG uploaded without its updater entry, no
  release created referencing an artifact that doesn't exist).

## Non-Goals

- **Universal (single-binary, both-arch) DMG.** Already an explicitly
  deferred, still-open question in `docs/ROADMAP.md`. Staying with separate
  per-arch DMGs, matching the existing pattern exactly — not reopening that
  question here.
- **Native Intel build hardware.** The build doesn't need to *run* Intel
  code, only compile, sign, and notarize it — all host-arch-agnostic
  operations. (Real Intel execution is already covered separately by
  `.github/workflows/test-llamacpp-intel.yml`, merged in #6.)
- **Beta/experimental labeling for the Intel build.** Ships at the same
  trust level and with the same documentation treatment as Apple Silicon —
  no disclaimer, no separate quality bar. Decided explicitly during
  brainstorming: the spec's own priority for the underlying engine was
  "best llama.cpp-supported model" over matching MLX's precision, and this
  release doesn't relitigate that.
- **Homebrew cask, marketing, or launch activities.** Out of scope — this is
  the release-pipeline and README-install-instructions work only.

---

## Architecture

`release-macos.yml` splits into two stages:

```
┌─────────────────────────────────────────────────────────────┐
│  build (matrix: aarch64-apple-darwin, x86_64-apple-darwin)   │
│  runs-on: macos-latest (arm64 host; x86_64 leg cross-compiles)│
│                                                                │
│    rustup target add ${{ matrix.target }}                    │
│    pnpm release:mac ${{ matrix.target }}                     │
│      → signed, notarized Beaver_<version>_<arch>.dmg          │
│      → signed Beaver_<version>_<arch>.app.tar.gz + .sig       │
│      → latest-fragment.json  { "darwin-<arch>": {sig, url} }  │
│                                                                │
│    upload artifacts:                                          │
│      Beaver-macOS-DMG-${{ matrix.target }}                    │
│      Beaver-macOS-Updater-${{ matrix.target }}                │
└─────────────────────────────┬─────────────────────────────────┘
                               │ needs: [build]  (both legs must succeed)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  publish                                                      │
│    download both DMG + updater artifacts                     │
│    merge two latest-fragment.json → one latest.json           │
│      { version, pub_date, platforms: {                        │
│          darwin-aarch64: {...}, darwin-x86_64: {...} } }      │
│    gh release create/upload: both DMGs + both tarballs         │
│                               + merged latest.json             │
└─────────────────────────────────────────────────────────────┘
```

Cross-compiling the `x86_64` leg from the same `macos-latest` (arm64) runner
was chosen over a native `macos-15-intel` runner: `codesign`, `notarytool`,
and `cargo build --target x86_64-apple-darwin` are all host-architecture-
agnostic — none of them need to *execute* the binary they're producing,
only compile/sign/submit it. Real Intel execution is a different concern,
already covered by the separate test workflow. One runner type keeps the
matrix simple and avoids the cost/scarcity of a second Intel runner for a
step that doesn't need one.

---

## Decisions locked during brainstorming

1. **Scope: build the pipeline AND actually publish a real release** — not
   just prove the CI can produce an artifact. Both DMGs go out together.
2. **No quality disclaimer for the Intel build.** Ships the same as Apple
   Silicon, no "beta" language anywhere.
3. **Cross-compile from the existing arm64 `macos-latest` runner** via a
   build matrix, rather than a native `macos-15-intel` runner. See
   Architecture above for the reasoning.
4. **`latest.json` assembled by a dedicated `publish` job** that runs after
   both matrix legs succeed, merging one small fragment per architecture —
   not each matrix leg writing (and clobbering) a full manifest.
5. **Version bump to `v0.2.0`.** Intel Mac support is a new capability, not
   a bugfix — gets its own minor version and `CHANGELOG.md` entry, per
   semver. Replaces `v0.1.1` as the "latest" release.

---

## Components

### 1. `scripts/release-macos.sh` (modified)

- **Target parameterization.** `TARGET="aarch64-apple-darwin"` (currently
  hardcoded) becomes `TARGET="${1:-aarch64-apple-darwin}"` — an optional
  first positional argument, defaulting to today's behavior so a bare
  `pnpm release:mac` on an Apple Silicon dev machine is unchanged.
- **Bug fix uncovered by this work:** the updater tarball filename is
  currently hardcoded to `Beaver_${VERSION}_aarch64.app.tar.gz` regardless
  of `$TARGET` — dormant only because nothing but `aarch64` has ever been
  built through this script. Becomes `Beaver_${VERSION}_${TARGET%%-*}.app.tar.gz`,
  matching the DMG's own naming pattern (which is already correctly
  parameterized).
- **`latest.json` generation replaced with a fragment.** Instead of writing
  a complete `{ version, pub_date, platforms: {...} }` manifest (today's
  behavior, and today's collision risk if run twice), the script's final
  step writes a small `latest-fragment.json`: just
  `{ "darwin-<arch>": { "signature": ..., "url": ... } }` — the one
  platform key this run knows about. No `version`/`pub_date` — those are
  set once, by the `publish` job, not duplicated per architecture (and
  potentially disagreeing on `pub_date` between two parallel runs).
- The rest of the script — build, inside-out codesign, DMG packaging,
  notarization, stapling, Gatekeeper verification — is already
  architecture-generic (uses `$TARGET`/`$APP`/`$DMG` throughout); no
  changes needed there.

### 2. `.github/workflows/release-macos.yml` (modified)

- `build` job gains `strategy: matrix: target: [aarch64-apple-darwin,
  x86_64-apple-darwin]`. `rustup target add ${{ matrix.target }}` replaces
  the hardcoded `aarch64-apple-darwin`. `pnpm release:mac ${{ matrix.target
  }}` replaces the no-arg call. Artifact upload names include `${{
  matrix.target }}` so the two legs' DMG/updater artifacts don't collide
  under the same artifact name (a real risk with `actions/upload-artifact`
  across matrix jobs).
- New `publish` job, `needs: build`, `if: inputs.tag_name != ''` (matches
  today's existing gate — an artifact-only dispatch with no `tag_name`
  still skips release creation, just as today). Downloads both matrix legs'
  artifacts, merges their `latest-fragment.json` files into one
  `latest.json` (adds `version` from `package.json` and one shared
  `pub_date` at merge time), then runs the existing
  `gh release create/upload` logic against the union of both DMGs, both
  updater tarballs, and the merged manifest.

### 3. Version bump (modified)

`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`:
`0.1.1` → `0.2.0`. `CHANGELOG.md` gains a `## [0.2.0]` section under
`### Added` describing Intel Mac support.

### 4. `README.md` (modified)

- `## Install` section gains an Intel Mac download line alongside the
  existing Apple Silicon one (both DMGs from the same release).
- The Prerequisites/Building-a-release language already updated in #6 (to
  say Intel is buildable from source) gets a small follow-up note that it's
  now also available as a packaged release, not source-only.
- Top-of-file "Apple Silicon only" banner is removed/rewritten — it's no
  longer accurate once a packaged Intel DMG exists. This is the one
  user-facing claim this spec actually invalidates; every other Non-Goal
  above was already correctly scoped as "not yet" rather than "never."

### 5. `Cargo.toml` / signing credentials (unchanged)

No new secrets. `APPLE_SIGNING_IDENTITY`, the App Store Connect API key
trio, and `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` are all reused verbatim by
both matrix legs — none of them are architecture-specific.

---

## Data Flow

1. Maintainer dispatches `Release macOS` with `tag_name: v0.2.0`.
2. Two `build` jobs run in parallel (`aarch64-apple-darwin`,
   `x86_64-apple-darwin`), each independently: build → sign nested
   binaries → seal `.app` → package DMG → sign DMG → notarize → staple →
   verify → build updater tarball → sign it → write its own
   `latest-fragment.json` → upload both artifacts under a target-suffixed
   name.
3. `publish` job waits for both, downloads both artifact sets, merges the
   two fragments into one `latest.json`, and either creates a new draft
   release `v0.2.0` or updates an existing one, uploading all 5 files (2
   DMGs, 2 tarballs, 1 manifest).
4. The in-app updater (unchanged code — `tauri-plugin-updater` already reads
   whichever `platforms.darwin-<arch>` key matches the running machine)
   picks the right entry automatically; existing `v0.1.1` installs on
   either architecture see the same single `latest.json` and update
   correctly regardless of which Mac they're running on.

---

## Error Handling

- **One matrix leg fails** (build, sign, or notarization rejected): the
  `publish` job's `needs: build` dependency means it never runs. No DMG
  without its updater entry ships; no `latest.json` references a
  nonexistent asset. This is strictly safer than today's single-target
  pipeline, which has no equivalent all-or-nothing guard (moot today since
  there's only one target, but the new design doesn't regress it).
- **`gh release create/upload` itself fails** in the `publish` job: existing
  behavior is preserved — the script already distinguishes "create new
  draft" vs. "upload to existing release" (`gh release view` check), so a
  re-dispatch after a transient failure is idempotent, same as today.
- **Local dev build** (`pnpm release:mac`, no argument): unaffected,
  defaults to `aarch64-apple-darwin`, produces exactly what it does today —
  a single DMG, no fragment-merging involved (the merge only happens in the
  `publish` job, which only exists in CI).

---

## Testing

- **No new automated test suite** — this is release-infrastructure, not
  application code. Verified the way `release-macos.sh` always has been:
  `codesign --verify --deep --strict`, `spctl -a -t open --context
  context:primary-signature`, and `xcrun stapler validate`, all already
  present in the script and exercised identically for both targets since
  they operate on `$APP`/`$DMG` generically.
- **Manual verification before calling this done:**
  1. A real `workflow_dispatch` run with a real `tag_name`, producing both
     DMGs and a real draft release.
  2. Download and open both DMGs on their respective architectures (or via
     Rosetta for a smoke test on Apple Silicon) — confirm both launch,
     both pass Gatekeeper (no right-click-Open workaround needed).
  3. Fetch the published `latest.json` and confirm it round-trips: one
     `version`, one `pub_date`, both `platforms.darwin-aarch64` and
     `platforms.darwin-x86_64` present with valid signatures and URLs
     pointing at real, downloadable assets.
  4. Install the previous `v0.1.1` DMG (either architecture) and confirm
     the in-app update pill finds and installs `v0.2.0` correctly — this is
     the one full end-to-end proof that the merged manifest actually works
     for real users, not just structurally.

---

## Risks & Trade-offs

- **Cross-compilation is unproven for this specific project until the first
  real run.** Rust/Tauri cross-compilation for macOS targets is
  well-supported in principle (same SDK ships both slices, `codesign`/
  `notarytool` are arch-agnostic), but this spec doesn't include a dry run
  before the plan executes it for real. If the `x86_64` leg hits an
  unexpected cross-compilation issue (e.g. a build-dependency crate with
  arch-specific native code that doesn't cross-build cleanly), the fallback
  is the already-scoped-out native-`macos-15-intel` alternative from the
  brainstorming Q&A — a plan-time pivot, not a design failure.
- **Two DMGs double the release artifact size and the manual verification
  burden** (Step "Manual Verification" above now has 2x the download/launch
  checks). Accepted — no way around it for two genuinely different
  binaries.
- **The README's "Apple Silicon only" banner removal is the one
  externally-visible, hard-to-quietly-revert claim in this spec.** Once
  published, real users on Intel Macs will download and rely on it.
  Accepted per the explicit "ship as-is, no disclaimer" decision — but
  worth naming as the one irreversible-in-spirit consequence of this spec,
  distinct from the reversible CI/script changes.

## Open questions for the plan

- Exact `CHANGELOG.md` wording for the `v0.2.0` entry (the plan should
  draft real copy, not "TBD").
- Exact fragment-merge implementation (inline `node -e`/`jq` in the
  workflow YAML vs. a small committed script) — a plan-level detail, not a
  design-level one.
- Whether `actions/upload-artifact`'s per-matrix-leg naming needs
  `overwrite: true` or is naturally collision-free with target-suffixed
  names — verify against the current `actions/upload-artifact@v4` behavior
  at implementation time.
