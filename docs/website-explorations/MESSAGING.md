# Beaver website messaging platform

Shared copy foundation for all design explorations. Every page draws from this;
each direction emphasizes a different slice of it.

Writing rules: plain verbs, short sentences, sentence case. No em-dashes. No
"seamless", "effortless", "supercharge", "unleash". Write like a person
explaining a tool to a colleague.

## The one-line story

You can see the data. You just can't use it. Beaver fixes that.

## Pain points (in the user's words)

- A table in a PDF, a dashboard, a bank statement. You need it in a
  spreadsheet. So you retype it, cell by cell.
- Code in a video tutorial, a conference talk, a screen share. You pause and
  type it out, and you still miss a bracket.
- Slides on a call. You ask for the deck. Nobody sends the deck.
- An error dialog you can't select. An old app with no copy button.
- A screenshot folder full of information you will never be able to search.

## Why not the alternatives

### Native screenshots (Cmd+Shift+4)

A screenshot is a photo of information. You can look at it, point at it, file
it away. You cannot paste it into a spreadsheet, run it, or search it. The
data is right there and completely out of reach.

### Plain OCR (Live Text, TextSniper)

Fast and private, but structure dies. Select a table and you get word soup:
every cell in one long line, columns gone. Code loses its indentation. You
spend the time you saved putting the pieces back together.

### Pasting screenshots into ChatGPT or Claude

It works. It is also slow, expensive, and lossy in ways most people never see:

- **It costs more than you think.** Models bill images by size. On Claude, a
  screenshot costs roughly its pixel count divided by 750 in tokens. A full
  window shot runs 1,500 to 2,000 tokens before the model says a word. The
  table inside it, as text, is often under 200.
- **The model reads a shrunk copy.** Big screenshots get downscaled before
  the model sees them. Small text lands below what the vision encoder can
  resolve. The model does not tell you it can't read a digit. It guesses.
- **Plausible is not correct.** In one published benchmark, GPT-4V answered
  35 of 50 table questions wrong. Hallucinated cells and swapped columns look
  exactly like real data.
- **It is a conversation.** Open the chat, attach, explain what you want,
  wait, copy back, fix the formatting. That is a workflow, not a copy.
- **Your screen leaves your machine.** An invoice, a patient record, a
  contract under NDA. Once it is in a chat window, it is in a datacenter.

### Where Beaver sits

LLM-grade understanding at OCR-grade speed and privacy. You crop exactly the
region that matters, so the model reads it at full resolution, on your Mac,
and gives you the structure back: tables stay tables, code stays code.

## Differentiators (from the roadmap, in plain words)

1. **Private by architecture, not policy.** The vision model runs on your
   Mac. A capture has no network path. Cloud tools promise privacy. Beaver
   can prove it: the code is open, the logs are local, and you can watch the
   network do nothing.
2. **A reflex, not a conversation.** Keystroke, drag, done. The result is on
   your clipboard before a chat tab would have finished loading.
3. **Deterministic.** One transformation, the same way, every time. Output
   shape is a setting, not a negotiation.
4. **No meter.** No tokens, no subscription, works offline, works on a plane.
5. **Feeds your AI instead of competing with it.** Clean Markdown into
   Claude, Obsidian, Notion, or an agent. Smaller, cheaper, and exact,
   instead of a blurry image the model has to decode all over again.

## Hero use cases

1. **Table to spreadsheet.** Any table on screen lands in Excel, Sheets, or
   Markdown with rows and columns intact.
2. **Code from anywhere.** Tutorials, screen shares, Slack screenshots.
   Indentation and language survive.
3. **The stuff you'd never paste into a chatbot.** Invoices, statements,
   contracts, patient notes. Extract it without it leaving the room.
4. **Feeding AI workflows.** Screenshot to clean Markdown to your model of
   choice. Exact text at a tenth of the tokens.
5. **Slides on calls.** Take notes from a shared screen without asking for
   the deck.

## Proof points

- Vision runs on-device: MLX on Apple Silicon, llama.cpp on Intel Macs.
- Open source (MIT). Build it from source if you want.
- The only network calls are an optional update check against GitHub, and
  you can turn that off with one environment variable.
- History is a local SQLite file on your disk.

## CTAs

- Primary: **Download for Mac** (GitHub releases, latest DMG)
- Secondary: **View on GitHub** / **See it work** (scroll to demo)
- Qualifier line: Free and open source. macOS, Apple Silicon and Intel.

## Voice notes

- The mascot can be playful. The claims stay concrete.
- Numbers beat adjectives: "under 200 tokens" beats "lightweight".
- Every section should answer one question a visitor actually has.
