# Website design explorations

Five distinct landing page directions for Beaver, each a self-contained HTML
file with full copy and CTAs. They all draw from the same copy platform
([MESSAGING.md](MESSAGING.md)) but argue the case differently.

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

## Shared decisions across all five

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

Pick a direction (or a hybrid, e.g. Reflex structure with the Lodge's
mascot moments and the Receipts' token math as a section), then implement it
in `apps/website` (React + Tailwind) test-first, replacing these static
mockups. These files are throwaway exploration artifacts, not production
code.
