# Website Email Capture — Design Spec

**Date:** 2026-07-27
**Status:** Approved; small enough to implement directly (no separate plan doc)
**Author:** Thomas Indrias / Claude

---

## Problem

Both CTAs on the marketing site (`Download for Mac`, `View on GitHub`) point
straight at GitHub. A launch-day traffic spike (Show HN, Reddit, later Product
Hunt) therefore converts into nothing kept — no way to reach a visitor who
isn't ready to install right now, and no owned channel for future launches.

## Goals

- Capture an email address from interested visitors without competing with
  the primary "Download for Mac" CTA.
- No backend work: Buttondown's own hosted embed form handles storage,
  confirmation, and unsubscribe.
- Match the site's existing visual language and test conventions exactly.

## Non-goals

- No custom success/error UI. Buttondown's own confirmation page (opened in a
  popup, its documented embed pattern) is enough.
- No double opt-in customization, no tagging, no welcome-sequence copy — all
  deferred until there's a list to write to.

## Decisions

1. **Placement: inside `FinalCta.tsx`, below the existing buttons.** The last
   content before the footer, and the natural moment for a visitor who read
   the whole page but isn't installing today. `Download for Mac` stays the
   unchallenged primary action.
2. **Copy: "New releases, no spam."** Plain, no em-dash, no promise the
   product can't yet keep (no benchmark to point to today).
3. **Plain HTML `<form>`, not a JS `fetch` call.** Verified against Buttondown's
   current docs: the endpoint is `https://buttondown.com/api/emails/embed-subscribe/{username}`,
   POST, with a hidden `embed=1` field. A native form POST is exempt from the
   CORS restriction a cross-origin `fetch` would hit; Buttondown's own
   recommended pattern opens their hosted page in a popup window
   (`target="popupwindow"` + `onSubmit` window.open) rather than building
   custom success/failure handling.
4. **Username is a placeholder constant, not created by me.** Account creation
   is the user's own action. `BUTTONDOWN_USERNAME` in `constants.ts` ships with
   a clearly-marked placeholder; swap it in after signing up.

## Component

`apps/website/src/components/EmailCapture.tsx` (new):

```tsx
interface Props {
  username: string;
}

export function EmailCapture({ username }: Props) {
  return (
    <form
      action={`https://buttondown.com/api/emails/embed-subscribe/${username}`}
      method="post"
      target="popupwindow"
      onSubmit={() => {
        window.open(`https://buttondown.com/${username}`, "popupwindow");
      }}
      className="mt-5 flex flex-wrap items-center justify-center gap-2"
    >
      <label htmlFor="bd-email" className="sr-only">
        Email address
      </label>
      <input
        id="bd-email"
        type="email"
        name="email"
        required
        placeholder="you@example.com"
        className="card-sticker rounded-full border-2.5 px-4 py-2.5 text-body-sm text-ink placeholder:text-muted"
      />
      <input type="hidden" name="embed" value="1" />
      <button type="submit" className="btn-push bg-river px-5 py-2.5 text-white">
        Get updates
      </button>
      <p className="w-full text-2xs text-muted">New releases, no spam.</p>
    </form>
  );
}
```

Styling reuses existing tokens (`card-sticker`, `btn-push`, the color/text
scale in `index.css`) rather than inventing new classes.

`FinalCta.tsx` renders `<EmailCapture username={BUTTONDOWN_USERNAME} />` below
the existing button row.

`constants.ts` gains:

```ts
// Replace with your actual Buttondown username after creating an account at
// https://buttondown.com. This placeholder will not collect real signups.
export const BUTTONDOWN_USERNAME = "beaver-placeholder";
```

## Testing

- `EmailCapture.test.tsx`: renders an email input and a submit button; the
  form's `action` attribute is built from the given `username` prop; the
  hidden `embed` field is present with value `1`.
- `FinalCta.test.tsx` (extended): renders the email capture form with the
  configured username.

No test submits the form for real — Buttondown's endpoint is external and
plain-form submission isn't meaningfully testable in jsdom; the contract under
test is the markup Buttondown's docs specify (action URL, method, hidden
field), matching how `Hero.test.tsx` already asserts `href`/`src` attributes
rather than behavior of external links.
