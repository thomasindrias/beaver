# Website design explorations

Six landing page directions for Beaver, each a self-contained HTML file with
full copy and CTAs. They all draw from the same copy platform
([MESSAGING.md](MESSAGING.md)) but argue the case differently.

Status: the Lodge (03) and the Receipts (05) were picked as top candidates
and expanded; 06 is a hybrid of the two and the current lead for
implementation.

**To view:** serve the repo root and open each page (assets load from
`public/` via relative paths):

```bash
python3 -m http.server 8000
# then open http://localhost:8000/docs/website-explorations/01-reflex.html
```

Full-page previews live in [screenshots/](screenshots/).

## The five directions

### 1. The Reflex — `01-reflex.html`

The safe-strong option. macOS-utility minimalism in the existing brand
palette (paper, ink, orange), system font stack. The hero is an animated
capture: a marching-ants selection draws itself around a PDF table and the
Markdown types onto a clipboard panel. Headline: "The missing Cmd+C".
Best if the goal is a credible, Apple-native look that demos the product in
the first five seconds.

### 2. The Ledger — `02-ledger.html`

The concept page. The entire site is a rendered Markdown document
(`beaver.md`) with a working source/rendered toggle in the top bar, an
editor status bar ("network: idle · model: on-device"), and checklists as
`[x]` items. The medium is the message: this is what your screen looks like
after Beaver. Best for a developer-heavy audience; the boldest of the five.

### 3. The Lodge — `03-lodge.html`

The personality play. Warm cream and river teal, Fraunces display type,
thick-outline sticker cards, wavy dividers, and the mood animations doing
real work: waving at hello, crying at busywork, fuming at cloud uploads,
sleeping through the privacy section, heart-eyed at the CTA. Headline:
"Stop retyping your screen." Best for broad consumer appeal and
memorability; closest to indie-Mac-app tradition.

Expanded after the first review round with a "You boxed this. You pasted
this." before/after exhibit and a "Four ways to grab the same table"
comparison strip, so the product and the why are both shown, not just told.

### 4. Airgap — `04-airgap.html`

The trust document. Dark pine and amber, Archivo wide headers, JetBrains
Mono data. Reads like a spec sheet: an animated data-path diagram with the
route to the cloud visibly severed, a life-of-a-capture timeline, a
what-leaves-your-Mac table (five rows, four "never"), and a
"Don't trust us. Check." section. Headline: "Nothing leaves this machine."
Best if privacy is the wedge, e.g. finance, health, legal audiences.

### 5. The Receipts — `05-receipts.html`

The argument. An essay-style page (Source Serif + mono) aimed at people who
already paste screenshots into ChatGPT or Claude. Opens with "A screenshot is
the most expensive way to send text to an AI", proves it with an itemized
token receipt (1,928 tk vs 184 tk), a downscaling demo (what you attached vs
what the model reads), the 35-of-50 table benchmark stat, and cited sources
as footnotes. Best for the AI-workflow audience and as shareable content.

Expanded after the first review round with a fifth argument section (some
screens should never leave the room), a three-step how-it-works strip in the
fix band, and a "Do the math for your workflow" slider that turns
captures-per-day into tokens and dollars saved, with honest caveats.

### 6. The Hybrid (Lodge × Receipts) — `06-hybrid.html`

The current lead. Lodge's visual language (cream and river teal, Fraunces,
sticker cards, wavy dividers, mood mascots) carrying Receipts' argumentative
spine. Flow: hero and busywork stickers set the human pain, "One drag. Dam,
done." plus the boxed-this-pasted-this exhibit show the product, then the
"Can't I just paste it into ChatGPT?" section stages the token receipt
(taped up like a note) beside three numbered reasons and the 35-of-50 stat,
with cited sources kept at the bottom for credibility. Privacy night
section, use cases, and the "Give your Mac a beaver." close remain from
Lodge.

## Shared decisions across all pages

- Primary CTA is always **Download for Mac** (GitHub latest release);
  secondary is **View on GitHub** or a scroll-to-proof link.
- Qualifier line: "Free and open source · macOS · Apple Silicon and Intel."
- Copy follows MESSAGING.md: short sentences, concrete numbers, no
  em-dashes, no hype adjectives.
- Every page covers the same five questions in its own voice: what is this,
  why not screenshots/Live Text/chatbots, how does it work, why should I
  trust it, what do I do next.
- Responsive to mobile, `prefers-reduced-motion` respected, visible focus
  states.

## Next step

Confirm 06 (or name tweaks to it), then implement it in `apps/website`
(React + Tailwind) test-first, replacing these static mockups. These files
are throwaway exploration artifacts, not production code.
