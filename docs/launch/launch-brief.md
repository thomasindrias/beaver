# Beaver Launch Brief

**Date:** 2026-07-27
**For:** Show HN, r/LocalLLaMA, r/rust, r/macapps
**Status:** Source material. Not paste-ready copy.

---

## Read this first

**r/rust and r/LocalLLaMA both prohibit AI-generated post text.**

- r/rust rule 6: "No slop, whether automatically generated or not. Submissions
  appearing to contain AI-generated content may be removed at moderator
  discretion."
- r/LocalLLaMA rule 3: "Completely/primarily LLM generated copy, code is not
  allowed."

So this document is deliberately **not** a set of posts to paste. It is the raw
material: the angles, the numbers, the objections and honest answers. Write the
posts yourself from it.

That is also the better play on merit. The single most persuasive sentence you
can write is why *you* built this, and no one else can write it. The audience on
these three subs is unusually good at spotting generated text, and getting
caught costs more than a weak post ever would.

---

## The positioning

The one-line frame, from the roadmap:

> **LLM-grade understanding at OCR-grade speed and privacy.**

The competitive set and why each leaves a gap:

| Alternative | What it does well | Where it fails |
|---|---|---|
| macOS Live Text | Free, instant, built in | Structure dies. A table becomes word soup, code loses indentation |
| TextSniper and similar | Fast, focused OCR | Same structural problem; it is OCR, not understanding |
| Screenshot into ChatGPT/Claude | Understands anything | Slow, conversational, and ships your screen to a datacenter |

Beaver sits in the gap: it understands structure like a model, but runs on-device
at reflex speed.

**The sharpest single claim:** privacy here is architectural, not promised. When
the local engine runs, there is no network path for a capture to take. That is
checkable in the source and observable with Little Snitch. Most tools can only
promise this; you can prove it.

**Do not lead with "AI".** Every audience you are targeting is saturated with it.
Lead with the concrete outcome: screenshot a table, paste a spreadsheet.

---

## The demo that does the work

Screenshot a table from a PDF or a dashboard, paste into Excel or Numbers, and
the columns are intact. That is the entire pitch in one motion.

`docs/media/demo.gif` already shows this. It is the most valuable asset you have
and it should appear above the fold everywhere.

Second-best demo: code from a YouTube tutorial or a screen share, pasted back
with indentation intact. This one lands especially well on HN.

---

## Channel notes

### Show HN

Guidelines that actually bind:

- Title must begin with `Show HN:`.
- Explain **how and why** you built it.
- Make it easy to try "ideally without barriers."
- Be present all day to answer.
- **Do not ask anyone to upvote.** This is the one rule that gets accounts
  penalized.

**The barrier problem, stated honestly.** HN asks for no barriers to trying it.
Beaver's path is: download a 45MB DMG, grant Screen Recording permission, then
wait on a multi-GB model download on first launch. That is three barriers before
first value.

Do not hide this. Say it in the post, before someone else says it for you. The
GIF is what lets people evaluate it without installing, so lead with that. The
MIT repo and `install.sh` also mean a skeptic can read and build rather than
trust a binary, which is exactly the kind of answer HN respects.

**Title candidates** (plain and concrete beats clever here):

1. `Show HN: Beaver – screenshot a table, get a spreadsheet, fully on-device`
2. `Show HN: Beaver – macOS tool that keeps structure when you screenshot it`
3. `Show HN: Beaver – on-device screenshot to Markdown/CSV/JSON (MLX, llama.cpp)`

Number 1 is the strongest: it names the outcome and the differentiator in seven
words. Number 3 is better if you want the local-inference crowd specifically.

**Body structure** — write each of these in your own words, roughly a paragraph:

1. What it does, in one sentence, with the table example.
2. Why you built it. The real reason. If it was that you kept pasting
   screenshots of tables into ChatGPT and hated it, say exactly that.
3. How it works technically: Tauri, Rust core, MLX with Qwen2.5-VL-3B on Apple
   Silicon, llama.cpp with MiniCPM-V on Intel. HN wants this.
4. The privacy architecture, stated as a fact about the code rather than a
   value: local captures have no network path.
5. The honest limitations paragraph. See objections below.
6. What you want feedback on.

### r/LocalLLaMA

Probably your best-fit subreddit. It is exactly the audience for on-device VLM
inference, and they will care about the model choice and the quantization.

- Rule 4: self-promotion should stay under roughly 1/10th of your activity, and
  **affiliation must be disclosed.** Say "I built this" in the first line.
- Rule 3 bans LLM-generated copy. Write it yourself.
- Lead with the model and the engineering, not the product. This audience will
  be more interested in "Qwen2.5-VL-3B-4bit via MLX, here is what it gets right
  and wrong on tables" than in a feature list.
- Real hook for them: it is a practical, shipped use of a small local VLM that
  is not a chatbot.

### r/rust

- Rule 6 bans low-effort and AI-generated content, and mod discretion is broad.
- Rule 2: post titles should include useful context, and off-topic posts need a
  text post explaining Rust relevance.
- Angle for this sub: the architecture, not the product. The runtime-vs-
  compile-time engine selection is a genuinely interesting Rust design problem
  and worth writing up on its own: local backends are chosen at compile time by
  `cfg(target_arch)` because MLX needs Apple Silicon, but the cloud engine is a
  runtime choice layered on top, and a shared trait was the wrong answer because
  the two have asymmetric surfaces.
- Do not just announce the app here. Lead with the design decision.

### r/macapps — needs preparation, do not post cold

This one is gated harder than it looks:

- **10 local karma required** before you can post. Earn it by commenting in the
  sub first.
- **One self-promo post per developer per 30 days**, counted from your last app
  post **even if it was removed.** A rejected post burns the slot.
- Unless you qualify under their Trust vs. Transparency initiative, promotion is
  limited to the **monthly megathread**.
- A **PCP template** is required for main-feed dev posts.
- Open source posts must prefix the title with `[OS]`.
- Flair hierarchy is Lifetime > Subscription > Free, and "Free flair" is
  explicitly not for limited tiers. Beaver is genuinely ambiguous here since the
  source is MIT and free to build while the notarized build is the paid artifact.
  Read their flair guidance before choosing, and consider asking a mod.

Plan: spend a week or two genuinely participating, then post. Do not make this
your first channel.

---

## Objections you will get, and honest answers

Prepare these. On HN they will arrive within the first hour.

**"macOS already has Live Text. Why do I need this?"**
Structure. Live Text gives you the characters; it does not preserve that
something was a table, a nested list, or indented code. Have a side-by-side
ready. This is your strongest rebuttal and you currently have no artifact for
it (see gaps below).

**"Why not just paste into ChatGPT?"**
Speed, privacy, determinism, and zero marginal cost. It is a reflex, not a
conversation. Also: no tokens, works offline, and the output shape is a setting
rather than a negotiation.

**"How accurate is a 3B model really?"**
Answer honestly. It is a small quantized VLM and it will make mistakes on dense
or low-contrast material. The BYO cloud engine exists precisely for when you
want a frontier model on a gnarly table. Do not oversell this one; overclaiming
accuracy is the fastest way to lose HN.

**"Multi-gigabyte model download for a screenshot tool?"**
Yes, once, on first launch, and then it works offline forever. Say the number.

**"Is it signed and notarized?"**
Releases are built through a workflow with Developer ID signing and notarization
wired in. Confirm the current release actually carries it before you claim it,
and if a build is unsigned, say so plainly along with the right-click-Open
workaround.

**"It's MIT but you want money?"**
The Aseprite model: pay for the built, signed, notarized, auto-updating app;
build from source for free. `install.sh` makes that a single command. Be
completely upfront, this audience respects it when it is not disguised.

**"Prove the privacy claim."**
Point at the architecture rather than arguing. Local captures have no network
path; the only outbound calls are an optional daily GitHub version check and
update downloads, both disableable with `BEAVER_DISABLE_UPDATE_CHECK=1`. Invite
them to watch it with Little Snitch. Note that BYO cloud is opt-in, off by
default, and every capture shows which engine ran.

**"Windows/Linux?"**
Honest answer: a stretch goal, not scheduled. The capture overlay, global
shortcut, tray, and permission flow are all macOS-specific today.

---

## Gaps that weaken the launch

Worth knowing before you post, in rough order of impact.

1. **No Live Text comparison artifact.** Your own roadmap says "structure
   survives" is the pitch and Live Text is the bar. The single most persuasive
   thing you could publish is a side-by-side on ten real tables. Right now the
   central claim is unevidenced, and the top HN comment will ask for exactly
   this. This is a marketing asset, not engineering polish.
2. **No latency numbers.** The roadmap's north-star metric is keystroke to
   correct data on the clipboard, p50 and p95. "Feels instant" is weak next to a
   number.
3. **No email capture.** Both site CTAs go straight to GitHub Releases, so a
   launch-day spike converts into nothing you keep.
4. **`beaver-website-xi.vercel.app`.** A default Vercel subdomain undercuts
   credibility, especially on Product Hunt later.
5. **No existing audience.** 0 stars, 13 total release downloads. This is
   precisely why HN and Reddit come before Product Hunt: they do not require one.

Items 1 and 2 are each maybe a day of work and would materially change how the
launch lands. Consider doing them first.

---

## Sequencing

1. **Week 1:** Show HN, plus r/LocalLLaMA on a different day. Start commenting
   in r/macapps to build the karma you need there.
2. **Week 1-2:** r/rust with the engine-architecture writeup, which is a
   different post rather than a repost.
3. **Week 2-4:** r/macapps once you qualify.
4. **Week 3-6:** Product Hunt, once you have a list, a benchmark, and a real
   domain. See `product-hunt-listing.md`.

Do not run these on the same day. Each deserves your full attention in the
comments, and staggering gives you several momentum peaks instead of one.

---

## Launch-day runbook

**The day before**
- Confirm the latest release downloads and launches cleanly on a machine that
  has never run Beaver, including the permission prompt and model download.
- Re-check the demo GIF renders correctly on GitHub and on the site.
- Clear your calendar. This is an all-day commitment, not a post-and-leave.

**Posting**
- Post early in the US morning, Tuesday through Thursday.
- Post, then do nothing else for the first 30 minutes except watch for the first
  comment.
- **Do not ask anyone to upvote.** It is against HN guidelines and detectable.

**During**
- Answer every comment. Speed matters more than polish.
- When someone finds a bug, thank them, file it, and link the issue in your
  reply. Publicly fixing something during the thread is the best possible signal.
- When someone is wrong, be generous. Onlookers are judging how you handle it.
- Do not argue with anyone who dislikes the pricing model. State it once and
  move on.

**After**
- Write down every feature request and objection. This is the most valuable
  output of the day, more than the traffic.
- Follow up with anyone who offered detailed feedback.
- If it went well, that is your Product Hunt ammunition. If it went badly, you
  learned what to fix for far less than a PH launch would have cost you.
