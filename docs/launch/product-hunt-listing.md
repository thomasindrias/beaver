# Beaver — Product Hunt Listing

**Date:** 2026-07-27
**Status:** Draft copy, ready to paste. Nothing submitted.
**Launch timing:** 3-6 weeks out, after Show HN and Reddit have built a list.

---

## You already have a draft

Product Hunt shows an in-progress post: **"Beaver · Stop retyping your screen."**
Continue that one rather than creating a new listing, or you will end up with
two.

Field limits below are from PH's current form conventions. **Verify each against
the live character counter as you paste** — PH adjusts these, and a silently
truncated tagline is a bad way to find out.

---

## Tagline

Your existing tagline is **"Stop retyping your screen"** (25 chars). It is
already decent: short, problem-framed, no AI buzzword, and it passes the "would
a human say this" test.

Its one weakness is that it undersells the actual differentiator. Retyping is
the symptom; the reason people retype is that copying *destroys structure*.
Every OCR tool on PH can claim to stop retyping. Only yours keeps the table a
table.

Options, strongest first:

| Tagline | Chars | Note |
|---|---|---|
| `Screenshot a table, paste a spreadsheet` | 39 | Most concrete. Names the outcome and implies structure survives. Best conversion bet |
| `The missing Cmd+C for everything on your screen` | 47 | Your own roadmap's framing. Memorable, positions it as a system utility rather than an AI app |
| `Stop retyping your screen` | 25 | Current. Fine, but generic enough that OCR tools could use it |
| `Screenshot anything, get structured data, on-device` | 51 | Adds the privacy hook but reads more like a feature list |

**Recommendation:** `Screenshot a table, paste a spreadsheet`. It is the demo,
compressed. Someone reading it immediately pictures the thing working.

---

## Description

Keep under ~260 characters.

> Beaver turns any screenshot into clean, structured data. Screenshot a table
> and paste a spreadsheet, with rows and columns intact. Code keeps its
> indentation. Vision runs on-device, so captures never leave your Mac. Free and
> open source, or bring your own cloud key.

(248 characters.)

---

## Topics

Pick 3. Suggested:

- **Mac** — your actual platform audience
- **Productivity** — largest relevant category
- **Artificial Intelligence** — for reach, though your positioning deliberately
  avoids leading with it

Consider swapping AI for **Privacy** or **Open Source** if either exists as a
topic when you submit. Both are truer to the product and put you in a less
crowded field where Beaver stands out rather than being one of forty AI tools
that day.

---

## Gallery

PH wants at least two images; the recommended size is 1270x760. The first image
is what appears in the feed and does most of the work.

Shot list, in order:

1. **The table demo, as a GIF.** `docs/media/demo.gif` already exists and is the
   single best asset you have. Note it is 4.7MB, so check PH's current size cap
   and compress if needed. This must be first.
2. **Side-by-side vs Live Text.** Same table screenshot, macOS Live Text output
   on the left as word soup, Beaver's on the right as a clean table. This
   artifact does not exist yet and is the most persuasive thing you could build.
   See the gap note below.
3. **The engine indicator.** The HUD showing 🔒 on-device, with a caption about
   captures having no network path when local. This is your differentiator
   against every cloud OCR tool on the platform.
4. **The Settings screen** showing the engine picker, demonstrating BYO cloud is
   opt-in and off by default.
5. **Code capture.** A tutorial screenshot to a fenced code block with
   indentation intact.

You also have five rendered Remotion launch-video variants in
`apps/launch-video`. PH supports a video, and a 30-second cut of the table demo
would outperform any static image. Pick the strongest variant and use it.

---

## First comment (maker comment)

This is the highest-leverage text on the page. Post it immediately after
launching.

Unlike the Reddit posts, PH has no rule against assisted copy, so this is a
usable draft. Still edit it into your own voice, particularly the second
paragraph, which should be true to why you actually built it.

> Hi Product Hunt 👋
>
> I built Beaver because I kept screenshotting tables and pasting them into
> ChatGPT just to get the data back out. That works, but it is slow, it is a
> conversation when I wanted a reflex, and for anything from a client or a bank
> statement I really did not want to send it anywhere at all.
>
> macOS Live Text is instant and private, but structure dies. A table comes back
> as a wall of words. Cloud AI understands the table perfectly but is slow and
> ships your screen to a datacenter. Beaver is meant to sit exactly in that gap.
>
> Press a shortcut, drag a box, and what was inside it lands on your clipboard
> as Markdown, CSV, JSON, or plain text, with the structure intact. Vision runs
> on-device via MLX on Apple Silicon and llama.cpp on Intel. When the local
> engine runs there is no network path for a capture to take, which is a
> property of the architecture rather than a promise. If you would rather use a
> frontier model on a gnarly table, you can add your own API key, and every
> capture shows you which engine ran.
>
> It is MIT licensed and self-buildable with one command. The signed, notarized,
> auto-updating build is what you pay for; the source is free forever.
>
> Honest limitations: it is a small quantized vision model, so it will make
> mistakes on dense or low-contrast material. First launch downloads the model,
> which takes a few minutes, and then it works fully offline. macOS only for
> now.
>
> I would love feedback on where the extraction falls down. Failure cases are
> genuinely the most useful thing you can send me.

---

## Before you launch on PH

Do not run this until these are true. PH is effectively one shot, and unlike
Show HN it rewards having an audience already.

- [ ] **Real domain.** `beaver-website-xi.vercel.app` undercuts you next to
      funded startups. Buy the domain yourself; this is a purchase and your
      account, so I will not do it for you.
- [ ] **Email capture live on the site.** Both CTAs currently point at GitHub
      Releases, so PH traffic converts into nothing you keep. This is the single
      highest-ROI fix before launching anywhere.
- [ ] **Live Text comparison published.** Your own roadmap calls this the pitch.
      Without it, "structure survives" is an unevidenced claim, and it is also
      gallery image #2.
- [ ] **Show HN and Reddit done first**, so you have both users and a list to
      mobilize in the first hours, which is what PH's ranking actually rewards.
- [ ] **Latency numbers published** (p50/p95). "Feels instant" is weak next to a
      measured number.
- [ ] Confirm the current release is genuinely signed and notarized, so first
      launch is not a right-click-Open experience for everyone who arrives.

## Launch day

- Launch at **00:01 PT**. PH days run on Pacific time and the full 24 hours
  matter.
- Tuesday through Thursday.
- Post the maker comment immediately.
- Answer every single comment. Treat it as an all-day job.
- Send your email list (once it exists) to the PH page, not to your homepage.
- Do not buy upvotes or run an upvote-swap group. PH detects it and penalizes,
  and it is the fastest way to lose the credibility the launch was for.
