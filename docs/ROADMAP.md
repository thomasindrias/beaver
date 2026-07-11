# Beaver Roadmap

_Last updated: 2026-07-10_

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
  default, provable when local."* Side benefit: a cloud engine path can later
  unlock non-Apple-Silicon Macs.
- **Post-capture UX: instant copy + anchored HUD.** The default result is
  copied immediately — nothing blocks the reflex. A small HUD appears
  **anchored to the selection region** (not cursor-following, not a corner
  toast) offering:
  - format chips — `Markdown · Table/CSV · JSON · Plain` — that re-render the
    same capture without re-shooting;
  - one optional single-line formatting hint (e.g. "headers are dates",
    "output Swedish") that re-runs the extraction once;
  - keyboard-first: `1–4` switches format, `/` focuses the hint, `Esc`
    dismisses. No follow-ups, no thread.
- **Presets are output modes, not prompts.** Fixed transformations bound to
  shortcuts — like choosing PNG vs PDF in a screenshot tool. User-authored
  free-text prompts as a primary flow would re-invent the chat box.

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
  tables) behind the same engine picker.

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
- Revisit non-Apple-Silicon support via the cloud engine path.

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

- **HUD hint semantics:** does the one-line hint re-run locally only, or may
  it use the cloud engine when configured? (Leaning: same engine as the
  original capture.)
- **Benchmark corpus:** what goes in the public fidelity benchmark and where
  does it live (repo vs website)?
