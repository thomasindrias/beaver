# Launch video design — five Remotion variants

Date: 2026-07-22. Status: approved by Thomas (direction + all five variants).

## Goal

A launch film for Beaver at the craft level of the Gemini 3 launch piece
(analyzed frame-by-frame from the reference upload): morphs instead of cuts,
a camera that never stops, eased motion, animated type, transitions locked to
a tempo grid. Five distinct variants, each its own Remotion composition on a
shared primitive kit, rendered locally. No paid services anywhere in the
pipeline.

## Reference findings (what "high grade" means here)

- ~14s of content, six beats, exactly one hard cut. Scene changes ride
  light-bloom wipes or object morphs.
- Continuous camera: slow push-ins, zoom-outs, 3D tilts with depth of field.
- Product UI is recreated as an idealized motion mockup, staged in dark 3D
  space, never a raw screen recording.
- Type is animated: letter-by-letter wordmark, typed prompt with cursor.
- One accent color carries every glow. Music swells exactly at the
  light-to-dark transition (verified via loudness curve).

## Constraints

- No mascot animations (to be improved later). The app icon carries the
  ending.
- Copy: short, plain, specific, sentence case, no em-dashes, no hype words,
  no rule-of-three sloganeering. Prefer lines already in the repo
  (site, MESSAGING.md). Some beats carry no copy at all.
- Motion: restraint over decoration. Every effect earns its place.
- Tokens come from the real app: dark world is `src/index.css` (Geist,
  amber `oklch(0.81 0.155 78)` on slate `oklch(0.165 0.006 285)`); paper
  world is `apps/website/src/index.css` (cream `#fdf6ec`, ink `#2b2019`,
  Fraunces). UI replicas copy the exact classes of `CaptureHud.tsx`,
  `CaptureOverlay.tsx`, `Kbd.tsx`.

## Tempo grid

90 BPM at 30fps: 20 frames per beat, 80 per bar. All scene boundaries sit on
bar lines so any 90 BPM track drops in later. Review renders ship with a
minimal locally synthesized sound bed (drone, riser into the drop, soft
section hits, typing ticks), mixed quiet.

## The five variants

1. **TwoWorlds (~24s)** — the master narrative. Cream paper world: an
   invoice table resists selection ("You can see the data." / "You just
   can't use it."). ⌘⇧D keycaps land, the world dims to slate on the swell,
   the real overlay draws a selection (crosshair, corner ticks, W×H
   readout). Selection dissolves to amber particles, into the HUD pill
   (one pun, then "Copied as table"), a Markdown card types itself.
   Chips re-flow the same capture to CSV and JSON. Card docks into a Mac
   outline, network line stays flat, "Nothing leaves your Mac." Particles
   assemble the app icon; "Beaver" letter-reveals; "Stop retyping your
   screen." / "Free and open source · macOS".
2. **Reflex (~20s)** — near-wordless montage. One continuous camera move
   across a dark canvas; captures fire on bar lines: PDF table, code in a
   paused video, a chart slide, an error dialog. Selections draw, pills pop,
   outputs snap into a grid, tempo tightens. One line late: "It doesn't
   care where it came from." Icon close: "The missing ⌘C."
3. **Receipt (~22s)** — the argument. "Can't I just paste it into
   ChatGPT?" Split choreography: screenshot uploads and visibly downscales,
   a digit flickers wrong, meter spins to 1,928 tokens; Beaver lane reads
   the exact crop on device, 184 tokens, digits intact. Lanes converge:
   "It never left your Mac."
4. **LightsOut (~20s)** — the privacy film. Wi-Fi toggles off in the first
   two seconds; the entire demo then works in that darkness with a
   dead-flat network meter riding every shot. "Works offline. Works on a
   plane." Ends "Your data sleeps at home." then the icon.
5. **RasterToVector (~20s)** — kinetic typography. A wall of soft
   unselectable pixel-text is swept by an amber scanline and crystallizes
   into live glyphs mid-move. "If you can see it, you can have it." Type
   morphs through pipe-table, JSON, CSV textures; the field dissolves into
   particles that build the icon.

## Architecture

`apps/launch-video` (new pnpm workspace package):

- `src/lib/` — pure logic, unit-tested first (vitest): easing/progress
  helpers, seeded RNG (mulberry32), tempo-grid math, type-on character
  math.
- `src/components/` — shared kit: CameraRig (continuous eased moves),
  Particles (deterministic canvas; rect-dissolve and assemble-to-image via
  offscreen pixel sampling), TypeOn, LetterReveal, Glow, SelectionBox,
  HudPill, Keycap, NetworkMeter, DocCard, MacOutline.
- `src/scenes/<variant>/` — one folder per variant, beats as components.
- `src/Root.tsx` — five 1920×1080 compositions. Vertical and GIF cutdowns
  are added only for the winning variant (YAGNI).
- Styling: inline styles + a `theme.ts` mirroring the exact app/site
  tokens, fonts via fontsource (Geist, Fraunces). No Tailwind in the video
  package; replicas transcribe the app's computed styles.
- Determinism: no `Math.random`/`Date.now`; all motion frame-derived.
- Audio: ffmpeg-synthesized stems in `audio/`, wired with Remotion
  `<Audio>`; final loudness normalize at export.

## Deliverables

Five 1920×1080 H.264 masters for review. After a winner is picked: vertical
1080×1920 cut and the README `docs/media/demo.gif` cutdown.
