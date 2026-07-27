import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FinalCta } from "../components/FinalCta";
import { BUTTONDOWN_USERNAME, GITHUB_URL, RELEASES_URL } from "../constants";
import { stubMatchMedia } from "./helpers";

describe("FinalCta", () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => vi.unstubAllGlobals());

  it("links the primary CTA to the latest release", () => {
    render(<FinalCta />);
    expect(
      screen.getByRole("link", { name: "Download for Mac" }),
    ).toHaveAttribute("href", RELEASES_URL);
  });

  it("links the secondary CTA to the repo", () => {
    render(<FinalCta />);
    expect(screen.getByRole("link", { name: "View on GitHub" })).toHaveAttribute(
      "href",
      GITHUB_URL,
    );
  });

  it("offers the email capture form beneath the buttons, wired to the configured username", () => {
    const { container } = render(<FinalCta />);
    const form = container.querySelector("form")!;
    expect(form).toHaveAttribute(
      "action",
      `https://buttondown.com/api/emails/embed-subscribe/${BUTTONDOWN_USERNAME}`,
    );
  });
});
