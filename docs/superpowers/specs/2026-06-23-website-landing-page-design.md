# Website Landing Page — Design

## Goal

A minimal, single-screen marketing page for Beaver: the waving beaver video,
a short honest pitch, and one download CTA. Nothing else competing for
attention.

## Non-goals

- No multi-section marketing site (no features grid, pricing, testimonials).
- No CMS, blog, or analytics.
- No real download artifact yet — the CTA points at GitHub Releases, which
  becomes a working link the moment `pnpm release:mac` publishes a signed DMG
  there. No website change required when that happens.
- No custom domain wiring in this pass (deploys to a `*.vercel.app` URL).

## Architecture

New workspace package `apps/website` (`@beaver/website`): Vite + React 19 +
TypeScript, mirroring `apps/desktop`'s tooling exactly (Tailwind v4, Vitest,
`tsconfig` referencing the root config). It is a static site with zero
backend — `vite build` output is deployed as-is.

Reuses existing shared packages instead of duplicating anything:
- `@beaver/brand` — product copy/tagline constants.
- `@beaver/ui` — `BrandMark` (beaver head icon) and `cn` helper.

The wave video becomes a canonical brand asset at
`packages/brand/assets/beaver-wave.mp4`, synced into
`apps/website/public/beaver-wave.mp4` via a new entry in the existing
`scripts/sync-brand-assets.mjs` (same mechanism already used for
`beaver-head.webp` and `favicon.ico` into the desktop app).

Root `pnpm dev` / `pnpm build` already glob `apps/*` via Turborepo, so the
website joins automatically — no root script changes needed.

Two existing guard tests in `tests/workspace-config.test.ts` currently assert
*"no website app in this pass"* (a deliberate scope fence from the prior
monorepo refactor). Both flip to confirm the website app now exists and is
wired the same way the file already checks the desktop app.

## Visual identity

The video's own backdrop is not pure white — sampled directly from the
source clip, it's `#EFF0F6` (a soft, cool off-white). The page background
uses this exact value in both animation phases, so the video has no visible
seam against the page. In the settled (small) state, the video additionally
gets a soft CSS edge-mask (radial/linear fade at its rectangular border) so
it dissolves into the page rather than sitting in a hard box — color match
alone isn't enough once it's a smaller rectangle on the page.

Typography uses Geist Variable (`@fontsource-variable/geist`, already a
workspace dependency) for consistency with the desktop app. Headline in a
warm dark neutral (not pure black); subhead in a muted warm gray, width
capped (~480px) for readability. The CTA is a single solid warm-orange pill
button — color pulled from the beaver's own palette, not a generic SaaS
blue. No secondary button anywhere on the page.

A small `BrandMark` icon (beaver head, ~28-32px, decorative/`aria-hidden`)
sits top-left as a quiet, constant anchor across both animation phases. No
text wordmark, no nav bar.

## Copy

- Headline: **"Screenshot with purpose."**
- Subhead: **"Drag a box around anything on screen. Tables stay tables, code
  stays code — and it never leaves your Mac."**
- CTA label: **"Download for Mac"**
- Qualifier line under the CTA (replaces a separate footer):
  **"Apple Silicon only · macOS 13+"**

## Interaction / animation

A single `Hero` component drives a two-phase state machine:

```
"intro" --(video ended | click-to-skip | autoplay blocked)--> "settled"
```

**Intro phase:**
- Video renders full-bleed: fixed position, fills the viewport
  (`100dvw`/`100dvh` to dodge iOS Safari viewport-jump), `object-fit: cover`.
- `autoplay muted playsInline`, no `loop` — it's a one-shot ~5s clip.
- No text visible yet. Just the beaver.
- Clicking/tapping anywhere during this phase immediately transitions to
  `"settled"` (skip for impatient users, and the only path forward if
  autoplay never starts).
- If `videoRef.current.play()` rejects (autoplay blocked), transition to
  `"settled"` immediately rather than leaving a frozen/blank screen.

**Settle transition:**
- Triggered by the video's native `ended` event (primary path), or either
  fallback above.
- Implemented as a crossfade between two sized instances of the video,
  rather than animating one element across layout modes (fixed→static,
  viewport-sized→fixed-size). This is simpler to implement correctly and
  avoids layout-jump bugs, while still reading as a continuous motion when
  timed with matched easing (~400-600ms).
- The settled video instance mounts fresh and loops indefinitely — it
  naturally restarts the wave, which reads as intentional rather than a
  glitch (the wave is supposed to loop).

**Settled phase:**
- Compact centered layout: small looping video → headline → subhead → CTA →
  qualifier line, single column, vertically centered or near-top depending
  on viewport.
- Headline/subhead/CTA fade + slide in, slightly staggered after the video
  starts settling, so the reveal feels sequenced rather than simultaneous.

**Reduced motion:**
- `prefers-reduced-motion: reduce` skips the intro phase entirely — the page
  mounts directly into `"settled"`. The video element is present (so the
  page isn't broken) but does not autoplay; it's static until/unless the
  visitor interacts with it.

## Accessibility

- Video wrapper is `aria-hidden="true"` — it's purely decorative, conveys
  nothing not already in the text content, and has no audio.
- CTA is a real `<a href="https://github.com/thomasindrias/beaver/releases/latest" target="_blank" rel="noopener noreferrer">`
  — works without JS, crawlable, supports cmd/middle-click.
- `prefers-reduced-motion` handling as above.

## Testing (TDD)

Tests are written first, against real behavior — not markup decoration:

1. **Content contract** (Testing Library + jsdom): headline and subhead text
   render; CTA renders as a link with the correct `href`, `target`, and
   `rel`; qualifier line renders; `BrandMark` renders with
   `aria-hidden`/decorative.
2. **Phase state machine**:
   - Initial phase is `"intro"` by default.
   - With `prefers-reduced-motion: reduce` mocked via `matchMedia`, initial
     phase is `"settled"` and the intro video never attempts autoplay.
   - Firing the video's `onEnded` handler transitions phase to `"settled"`.
   - A click/tap during `"intro"` transitions to `"settled"` (skip).
   - A rejected `play()` promise (simulated autoplay block) resolves to
     `"settled"`.
3. **Asset sync contract** (extends `tests/brand-assets.test.ts`'s existing
   pattern): `packages/brand/assets/beaver-wave.mp4` bytes match
   `apps/website/public/beaver-wave.mp4` bytes.
4. **Workspace contract**: the two stale `tests/workspace-config.test.ts`
   assertions are updated to confirm the website app exists and is wired
   correctly, mirroring the existing desktop-app assertions in that file.

## Hosting

Deployed to Vercel, no custom domain in this pass — a `*.vercel.app` URL is
fine for now. Build command targets the workspace filter
(`pnpm --filter @beaver/website build`), output is `apps/website/dist`.
Domain wiring is a later, separate step with no code changes required here.
