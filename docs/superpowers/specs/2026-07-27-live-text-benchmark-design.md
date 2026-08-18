# Live Text Fidelity Benchmark — Design Spec

**Date:** 2026-07-27
**Status:** Approved; pending spec review before planning
**Author:** Thomas Indrias / Claude

---

## Problem

`docs/ROADMAP.md` names this benchmark as a north-star metric and a Phase 1
deliverable, and leaves its shape as an explicit open question:

> **Percentage of captures needing zero hand-editing** (structure fidelity,
> benchmarked against Live Text on a fixed corpus of tables/code/documents).
>
> Structure-fidelity benchmark vs Live Text on a fixed corpus; publish it.
>
> **Benchmark corpus:** what goes in the public fidelity benchmark and where
> does it live (repo vs website)?

Today the pitch — "structure survives, Live Text is the bar" — is asserted in
marketing copy with no evidence behind it. This spec builds that evidence: a
small, reproducible, publicly-inspectable comparison between Beaver's local
extraction and macOS's own Live Text, scored the way the roadmap's own metric
is phrased — pass/fail on whether a capture needed zero hand-editing.

## Goals

- A fixed, self-made corpus (no copyright risk, no "is this representative"
  ambiguity) covering the pitch's core categories: tables, code, and documents.
- A methodology any reader can re-run themselves: no manual UI interaction to
  reproduce, no proprietary tooling.
- An honest, transparent scoring process — raw outputs and reasoning published
  in full, specifically because the scorer (me) built the thing being scored.
- Whatever the actual numbers are, publish them. This spec does not assume or
  predict the outcome.
- A short summary surfaced on the marketing site, linking to the full result.

## Non-goals

- Not a statistically rigorous sample — 8 images is evidence, not a
  scientific study, and the copy should not overclaim what it is.
- Not measuring latency (that's the separate p50/p95 metric the roadmap also
  names) or cloud-engine accuracy — this benchmark is local engine vs Live
  Text specifically, since that's the comparison the pitch makes.
- Not automating the scoring judgment itself. A human/LLM-judged pass/fail
  with published reasoning is the deliverable, not a diffing algorithm — see
  Architecture for why.

---

## Architecture

### Corpus: self-made HTML mockups, not real screenshots

Each of the 8 images starts as a small standalone HTML/CSS mockup I author,
rendered and captured to PNG. This is deliberate over sourcing real
screenshots: real screenshots (a real PDF, a real dashboard) raise copyright
questions and can't be redistributed in the public repo; self-made mockups
can, and the source HTML ships alongside the PNG for full reproducibility.
Because I author the underlying data, the ground truth is known exactly at
creation time rather than reconstructed by inspecting the image afterward.

Four categories, two images each, matching the roadmap's own wording and the
hero use cases:

| Category | Two examples |
|---|---|
| Table | A clean pricing/line-item table; a denser comparison matrix |
| Code | A Rust snippet from Beaver's own source; a TypeScript snippet — both MIT-licensed, so no rights question |
| Document | A fake invoice; a fake bank-statement-style transaction list |
| Slide/dashboard | A fake presentation slide; a fake analytics dashboard |

**Capture mechanism.** The mockup HTML is opened in a real browser and
screenshotted to a file on disk. This is flagged as an open question for the
plan (see below) rather than decided with false confidence here, since the
exact tool call needs a one-image trial before committing to it for all 8.

### The Live Text side: a Vision framework script, not manual UI interaction

Live Text's underlying OCR is Apple's Vision framework (`VNRecognizeTextRequest`),
verified directly against current documentation before writing this spec:
recognized text comes back as individual line observations with no column or
table structure inferred — which is exactly the "word soup" failure mode the
pitch describes, not a comparison I'm constructing to be unfair.

`docs/benchmark/live-text-ocr.swift`, run as `swift live-text-ocr.swift
image.png`:

```swift
import Vision
import AppKit

let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
    FileHandle.standardError.write("could not load image: \(path)\n".data(using: .utf8)!)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

// Vision's origin is bottom-left; sort descending y to get top-to-bottom
// reading order, matching what a user sees when they select-all and copy.
let lines = (request.results ?? [])
    .sorted { $0.boundingBox.origin.y > $1.boundingBox.origin.y }
    .compactMap { $0.topCandidates(1).first?.string }

FileHandle.standardError.write("Vision revision: \(request.revision)\n".data(using: .utf8)!)
print(lines.joined(separator: "\n"))
```

No new Rust dependency, no Objective-C bridge crate — just the Swift
toolchain Xcode Command Line Tools already provides (which `install.sh`
already checks for). The revision is printed to stderr rather than hardcoded,
so `results.md` states the exact Vision revision used as a verifiable fact
rather than an assumption.

### Beaver's side: a new CLI binary, not a `#[ignore]` test

`src-tauri/src/bin/benchmark.rs` (new binary target in the existing `beaver`
crate): spawns the real MLX server directly via `std::process::Command` —
following `llamacpp.rs`'s existing real-server test's exact pattern of
spawning the resource binary directly rather than going through the
`AppHandle`-requiring `build_env`/`spawn_server` — pointed at this machine's
already-provisioned venv (`~/Library/Application Support/se.djtl.beaver/mlx-venv`,
overridable via `BEAVER_TEST_MLX_VENV` for portability, mirroring the existing
`BEAVER_TEST_GGUF_MODEL` convention). It then loops over every PNG in a given
corpus directory, calls `engine::mlx::extract_from_image` with the standard
Markdown prompt (`prompts::prompt_for(ExtractFormat::Markdown, None)` — the
same prompt a real capture uses), and writes each result to
`docs/benchmark/beaver-output/{name}.beaver.md`.

This is a CLI tool, not a `#[test]`, because the goal is producing artifacts
to be read and scored, not asserting a pass/fail Cargo can check — scoring is
a human/LLM judgment against ground truth, not a diff. Not part of the app
bundle: Tauri's bundler packages the primary executable and configured
resources, not arbitrary `src/bin/*` targets, but this is called out as
something to confirm during the plan rather than assumed.

### Scoring: pass/fail, judged in the open

For each image: does the extracted structure match the ground truth exactly
— every row/column present and correctly delimited, nothing dropped or
invented? Pass or fail, with a one-line note on what broke if it fails.

**The conflict of interest is real and stays visible rather than hidden.** I
built both the thing being measured and the thing measuring it. The mitigation
is publishing everything needed to re-judge independently: the ground truth,
both raw outputs, and the reasoning for each verdict, in `docs/benchmark/results.md`.
A reader who disagrees with a verdict has everything they need to say so.

**The actual numbers are not assumed.** Beaver runs a 3B quantized vision
model; it may fail some of these. Whatever happens gets published, including
a partial result — a mixed but honest result is more persuasive than a
suspiciously perfect one, and cherry-picking would undermine the entire point
of publishing a benchmark.

### Website: a summary section, not the full report

A new `apps/website/src/components/BenchmarkSection.tsx`, placed after
`ArgumentSection`/`SourcesSection` (the existing "here's the receipt" evidence
section) and before `PrivacySection` — another piece of receipts-style
evidence in the same vein, not a new category of content on the page. Shows
the headline pass rate, one or two example side-by-sides, and a link to the
full `docs/benchmark/results.md` in the repo for the rest. Exact copy and
which 1-2 examples to feature depend on the actual results, so this is built
after the benchmark runs, not before.

---

## Decisions locked during brainstorming

1. **Automated, reproducible pipeline**, not a one-time manual comparison
   performed by hand with the real Live Text UI. Chosen so any reader can
   re-run the exact benchmark themselves.
2. **8 images, 4 categories, 2 each** — table, code, document, slide/dashboard.
3. **Self-made synthetic corpus**, not real-world screenshots — avoids
   copyright risk entirely and everything ships in the public repo.
4. **Pass/fail scoring**, not a fuzzy percentage — matches the roadmap's own
   metric wording ("percentage of captures needing zero hand-editing")
   literally, and is more defensible under scrutiny than an invented score.
5. **Published in the repo now; a website summary section in this same pass**
   (not deferred), since the benchmark's entire value is being checkable.
6. **The scoring conflict of interest is disclosed, not hidden.** Full raw
   outputs and reasoning are published specifically so a reader can re-judge.

---

## Components

```
docs/benchmark/
  README.md                    — methodology, how to re-run it yourself
  results.md                   — ground truth, both outputs, verdicts, summary
                                  (written after the benchmark actually runs)
  live-text-ocr.swift           — the Vision framework script above
  mockups/
    table-a.html … slide-b.html — source HTML for each corpus image
  corpus/
    table-a.png / table-a.ground-truth.md
    table-b.png / table-b.ground-truth.md
    code-a.png   / code-a.ground-truth.md
    code-b.png   / code-b.ground-truth.md
    invoice-a.png / invoice-a.ground-truth.md
    invoice-b.png / invoice-b.ground-truth.md
    slide-a.png  / slide-a.ground-truth.md
    slide-b.png  / slide-b.ground-truth.md
  live-text-output/
    {name}.livetext.txt         — one per corpus image
  beaver-output/
    {name}.beaver.md            — one per corpus image, from the CLI binary

src-tauri/src/bin/benchmark.rs  — the Rust tool producing beaver-output/*

apps/website/src/components/BenchmarkSection.tsx  — site summary (new)
apps/website/src/tests/BenchmarkSection.test.tsx   — its tests (new)
apps/website/src/App.tsx                            — wire in the section
```

---

## Testing

Test-first where there's real logic to test; authored content (the mockups,
the ground truth, the actual scoring verdicts) is verified by inspection, not
forced into TDD — consistent with how copy and design assets elsewhere in
this project aren't unit-tested either.

- **`benchmark.rs`:** any pure logic (listing/sorting corpus files, building
  an output path from an input filename) gets extracted into small tested
  functions, matching this codebase's existing pattern (`server_args` in
  `mlx.rs`, `download_fraction` in `llamacpp.rs`). The actual spawn-server-
  and-extract flow is integration-level and run manually once to produce
  results, consistent with how `build_env`/`spawn_server` themselves aren't
  unit-tested elsewhere in this codebase.
- **`live-text-ocr.swift`:** a smoke check that it runs against a known corpus
  image and produces non-empty output — documented as a manual verification
  step in `docs/benchmark/README.md`, not a Cargo/vitest-integrated test,
  since there's no Swift test runner in this project.
- **`BenchmarkSection.test.tsx`:** standard React Testing Library coverage
  matching sibling components — renders the headline stat, links to the
  results file, matches the site's existing test conventions.

---

## Risks & trade-offs

- **8 images is a small, hand-picked sample.** Mitigated by publishing the
  full methodology and raw outputs so the claim is checkable, and by the
  copy being honest about scale rather than implying a large-scale study.
- **I score my own benchmark.** Addressed head-on in Architecture rather than
  minimized — full transparency is the mitigation, not a claim of neutrality
  I can't actually make.
- **The corpus-image capture mechanism is unverified at spec time.** Flagged
  explicitly below rather than assumed to just work.
- **The outcome is unknown.** If Beaver fails several of these, that result
  ships as-is. This spec does not pre-commit to a headline number.

---

## Open questions for the plan

- **Corpus-image capture mechanism.** The plan should verify on one image
  before committing to the same method for all 8: open the HTML mockup in a
  real browser and screenshot it to a file on disk (the `claude-in-chrome`
  tool's `save_to_disk` option is the leading candidate, already loaded this
  session). If that doesn't produce a usable file, fall back to `open` +
  window positioning + macOS `screencapture -R`.
- **Exact wording/layout of each of the 8 mockups** is implementation detail,
  not a design decision — drafted during execution, not word-for-word here.
- **Whether `src/bin/benchmark.rs` is excluded from the shipped app bundle**
  should be confirmed against `tauri.conf.json`'s actual bundle behavior
  during the plan, rather than assumed.
- **Exact website placement and copy** depend on the real results, so the
  `BenchmarkSection` task in the plan should run after the benchmark itself
  has produced `results.md`, not in parallel with it.
