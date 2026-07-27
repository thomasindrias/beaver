interface Props {
  username: string;
}

// Buttondown's own recommended embed pattern: a plain HTML form POST rather
// than a JS fetch, since a native form submission is exempt from the CORS
// restriction a cross-origin fetch would hit. Buttondown's hosted page opens
// in a popup on submit, so there is no custom success/error UI to build.
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
