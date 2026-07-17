# Beaver Roadmap

_Last updated: 2026-07-17_

## Purpose

> **Make everything on screen copyable.** If you can see it, you can have it —
> as data, instantly, private by default.

There is a huge amount of information people can *see* but cannot *use*:
tables in PDFs and dashboards, code in video tutorials and screen shares,
slides on calls, invoices, error dialogs, legacy apps with no copy button.
Existing answers are bad in opposite ways:

- **Plain OCR** (macOS Live Text, TextSniper): instant and private, but
  structure dies — tables collapse into word soup, code loses indentation.
- **Cloud AI** (pasting screenshots into ChatGPT/Claude): understands
  everything, but it is slow, conversational, and ships your screen to a
  datacenter — a non-starter for finance, health, legal, and NDA'd work.

Beaver sits exactly in the gap: **LLM-grade understanding at OCR-grade speed
and privacy.**

## What Beaver is — and is not

Beaver is **not an agent**. It is a system utility — the missing `Cmd+C` for
things that can't be copied. Agentic tools are *conversations* (attach,
explain, wait, copy back). Beaver is a *reflex* (keystroke, drag, done).
Reflexes don't lose to smarter conversations; they coexist by being instant,
deterministic, and invisible — the same reason `Cmd+Shift+4` exists next to
computer-use agents, and Raycast next to Siri.

**Scope test for every feature:** *"Would this be better in a chat window?"*
If yes, it is not Beaver's job. No chat UI, no follow-up threads, no
open-ended prompting. The moment Beaver asks you to explain what you want,
it's a worse Claude. The moment it just gives you the thing, it's something
Claude can't be.

### Durable differentiators

1. **Privacy is architectural, not promised.** The default engine runs
   on-device; a local capture has no network path. Cloud tools can promise
   privacy — Beaver can prove it.
2. **Determinism.** One transformation, the same way, every time. Output
   shape is a setting, not a negotiation.
3. **Zero marginal cost.** No tokens, no meter, works offline.
4. **Serves agents instead of competing with them.** Beaver can become the
   local, private sensor layer that agents call (MCP/CLI) instead of shipping
   screenshots to the cloud.

## Hero use cases (ranked by pain × demo-ability)

1. **Table → spreadsheet.** Screenshot a table anywhere → rows and columns
   intact in Excel/Sheets/Markdown. The flagship demo.
2. **Code from anywhere.** Tutorials, screen shares, Slack screenshots →
   runnable code with indentation and language intact.
3. **Private-context extraction.** Invoices, statements, contracts — content
   people cannot paste into ChatGPT.
4. **Feeding AI workflows.** Screenshot → clean Markdown → straight into
   Claude/Obsidian/Notion. Cheaper, faster, and safer than pasting an image.
5. **Meetings/lectures.** Slides shared on a call → notes, without asking for
   the deck.

## North-star metrics

- **Time from keystroke to correct data on the clipboard** (target: feel
  instant; measure p50/p95).
- **Percentage of captures needing zero hand-editing** (structure fidelity,
  benchmarked against Live Text on a fixed corpus of tables/code/documents).

## Decided product principles

These were discussed and settled (2026-07-10):

- **Engine: local by default, BYO cloud opt-in.** On-device MLX stays the
  default and the identity. Users may add their own API key for a fast cloud
  model (e.g. Claude Haiku, GPT-4o-mini-class, Gemini Flash) in Settings.
  Every capture visibly shows which engine ran (🔒 on-device / ☁️ provider).
  Cloud is never the silent default; the privacy claim becomes *"private by
  default, provable when local."* This generalizes across hardware — see the
  engine matrix below.
- **Post-capture UX: instant copy + anchored HUD, minimal by default.** The
  default result is copied immediately — nothing blocks the reflex. A small
  HUD appears **anchored to the selection region** (not cursor-following, not
  a corner toast) and uses **progressive disclosure — never more than one
  layer of information at a time**:
  1. *Default:* a single pill — `✓ Copied as table` — confirming the copy and
     the detected content type. Auto-fades. Most captures end here with no
     visible controls.
  2. *Hover or `1–4`:* the pill morphs into five icon-only chips — four
     format chips (Markdown / table / JSON / plain), a hairline divider, then
     a **custom chip** (sparkles). Format switches re-render the same capture
     and re-copy instantly.
  3. *Custom chip (or `/`):* the pill stretches **horizontally** — the four
     format chips collapse away and a single-line input grows into their
     space, while the sparkle chip stays planted on the right edge and turns
     amber: **the sparkle is the submit button**. The container never stops
     being a pill and nothing changes sides. Focus lands in the input; Enter
     or pressing the sparkle runs it; the extraction re-runs once and the HUD
     collapses back to the state-1 pill with the new result. The reflex
     always ends closed.
  Keyboard: `Tab` cycles a five-stop lap and the input is simply the fifth
  stop. On a format chip it switches the format directly — the amber active
  chip *is* the focus state, no separate focus ring. Tabbing past the last
  format **smoothly opens the input** (chips collapse, input grows, sparkle
  goes amber as the submit button); tabbing again closes it just as smoothly
  and wraps back to the first format (`Shift+Tab` runs the same lap in
  reverse). Open and close are one continuous toggle of the same pill.
  `1–4` jump straight to a format, `/` opens custom. `Esc` backs out one
  level: input → chips → dismissed.
  *Processing and errors live in the same pill*, with one shared grammar:
  leading icon slot, text line, and at most one round amber action chip on
  the right edge (the same position as the sparkle submit — "the thing on
  the right is the action" holds in every state). Processing shows an amber
  spinner with the rotating beaver one-liners (crossfade ~1.1s) and resolves
  in place to the state-1 copied pill — one continuous container from drag
  to result. Extraction errors show a soft-red triangle, "Dam — couldn't
  read that", and a retry chip that re-runs the **same region without
  re-dragging** (Enter retries, Esc dismisses). Permission errors show a
  lock, "Needs Screen Recording access", and a settings chip that opens
  System Settings; longer dwell. Red appears only in the icon — the pill
  stays neutral so errors read calm.
  No printed keyboard legends, no format labels, no follow-up thread. The
  engine indicator (🔒/☁️) appears only inside the expanded state once BYO
  cloud ships. Modernity comes from one continuous pill morphing
  (copied pill → chip row → stretched input pill), not from added elements.
- **Presets are output modes, not prompts.** Fixed transformations bound to
  shortcuts — like choosing PNG vs PDF in a screenshot tool. User-authored
  free-text prompts as a primary flow would re-invent the chat box.

## Engine matrix: universal hardware support

Decided (2026-07-17): the local/cloud engine choice is not an Apple-Silicon
special case — it generalizes across hardware. Local inference is the piece
that's platform-dependent; cloud is the constant that works identically
everywhere Beaver runs, since it's just an HTTPS call.

| Platform | Local engine | Cloud engine (BYO key) | Status |
|---|---|---|---|
| **Apple Silicon Mac** | MLX (Qwen2.5-VL-3B), on-device | Any provider (Claude, GPT, Gemini, …) | Local shipping today (v0.1); cloud engine is Phase 2 |
| **Intel Mac** | llama.cpp-class runtime, quantized vision model | Same, any provider | Not yet built — same app, same distribution, new local backend |
| **Windows** | llama.cpp-class runtime | Same, any provider | Stretch goal — needs a real port (capture overlay, global shortcut, tray, permissions) |
| **Linux** | llama.cpp-class runtime | Same, any provider | Stretch goal — same as Windows; capture APIs vary per desktop environment |

Why this shape:

- **Cloud is the free column.** The moment Beaver runs on a platform at all,
  cloud engine support comes for free — it's a network call, not a hardware
  dependency. Every engineering hour for "universal support" goes into the
  *local* column, not cloud.
- **MLX cannot be the universal local engine.** It's built specifically around
  Apple Silicon's unified memory architecture, with no supported Intel or
  non-Apple path — a second local backend is required for anything beyond
  Apple Silicon.
- **llama.cpp is the natural second backend, not a new concept.** Mature,
  genuinely cross-platform (CPU, plus Metal/CUDA/Vulkan), and already runs
  the same class of quantized multimodal models (Qwen2-VL and similar) Beaver
  targets today. It would ship the same way MLX does — bundled, no separate
  install — as a second engine option, not a replacement.
- **Intel Mac is the concrete near-term target; Windows/Linux are a stretch,
  not a committed phase.** Tauri supports both, but Beaver's capture overlay,
  global shortcut, and permission flow are macOS-specific today. Intel Mac
  only changes the inference backend — same app, same DMG, same permission
  model. Windows/Linux change everything else too, so that's its own project,
  not a checkbox on this one.

This reframes the Phase 4 item below: the path to "everyone else" isn't
"cloud only" — it's local gaining a second backend everywhere Beaver already
ships (Intel Mac), with cloud covering every platform immediately regardless
of local-engine maturity.

## Phases

### Phase 1 — Nail the loop (v0.1 → v0.5)

Make the hero use case undeniable.

- Measure and cut capture-to-clipboard latency; publish p50/p95.
- Structure-fidelity benchmark vs Live Text on a fixed corpus; publish it.
- Output format support in the pipeline: Markdown / Table-CSV / JSON / plain
  (prompt + post-processing in `mlx_server.py`, format plumbed through
  `mlx.rs` and the capture flow).
- **Anchored HUD** (per the decided UX above) replacing/evolving the current
  cursor toast.
- History search in the popover.
- Distribution: demo GIF in README, Homebrew cask, signed/notarized default
  builds, HN/Product Hunt launch with the table demo.

### Phase 2 — Settings & engines (v0.6 → v0.8)

Beaver currently has no settings surface; this phase creates it.

- **Settings screen:** engine selection, default output format, shortcut
  configuration, history retention, update-check toggle.
- **BYO cloud engine:** provider + API key (stored in macOS Keychain),
  per-capture engine indicator, per-preset engine choice. Local remains
  default.
- **Presets:** built-in library (table→CSV, invoice→JSON, translate,
  explain-error), each bindable to its own shortcut.
- Local model options (smaller = faster for plain text; larger for gnarly
  tables) behind the same engine picker. The picker is platform-aware: it
  only ever offers local backends the current hardware can actually run (see
  the engine matrix above) — cloud is always offered everywhere.

### Phase 3 — Become the bridge (v1.0)

Beaver stops being a utility and becomes infrastructure.

- **MCP server:** agents request a region/window capture and receive clean
  Markdown/JSON; pixels never leave the machine when the local engine runs.
- **CLI:** `beaver capture --format json`, capture from file
  (`beaver extract invoice.png`).
- Export targets: file, Obsidian/Notion, webhook.
- Drag a PDF/image onto the menu-bar icon for non-screenshot input.

### Phase 4 — Widen inputs

- Full-window and multi-region capture.
- Batch PDF processing.
- **Intel Mac support:** add the llama.cpp-class local engine per the engine
  matrix above; same app, same DMG, just a second local backend. Cloud engine
  already covers Intel Mac as soon as Phase 2 ships, independent of this.
- **Windows/Linux:** explicitly a stretch goal, not scheduled — requires its
  own port of capture/shortcut/tray/permissions, tracked separately from this
  roadmap if it happens.

**Sequencing discipline:** no new capture surfaces or integrations before the
core extraction is visibly better than the free alternatives. Live Text is
the bar; "structure survives" is the pitch.

## Monetization: one-time payment

Direction (2026-07-10): **one-time purchase, no subscription.** Beaver's
local-first architecture means zero marginal cost per user — no server bill
forcing recurring revenue — and BYO cloud keys keep any API cost on the user.
A lifetime license is both sustainable and on-message: *pay once, it's yours,
runs on your machine.*

Model: **pay for the built app, build from source for free.** The signed,
notarized, auto-updating DMG is the paid artifact; the MIT repo stays open
and self-buildable (à la Aseprite). The purchase buys convenience and trust,
not artificial locks.

Still open: price point, where the paywall starts (paid from v1.0 vs paid
from the start), and license-key mechanics (prefer offline validation —
phoning home for a license would undercut the privacy story).

## Open questions

- **Default engine on non-Apple-Silicon hardware:** does Intel Mac default to
  local (llama.cpp-class, likely slower/lower-quality than MLX on comparable
  Apple Silicon) or default to cloud until local quality is proven out? No
  decision yet — revisit when Phase 4's local backend lands.
- **HUD hint semantics:** does the one-line hint re-run locally only, or may
  it use the cloud engine when configured? (Leaning: same engine as the
  original capture.)
- **Benchmark corpus:** what goes in the public fidelity benchmark and where
  does it live (repo vs website)?
