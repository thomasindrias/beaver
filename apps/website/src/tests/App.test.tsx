import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";
import { GITHUB_URL, RELEASES_URL } from "../constants";
import { stubMatchMedia } from "./helpers";

describe("App", () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => vi.unstubAllGlobals());

  it("tells the whole story top to bottom, in order", () => {
    render(<App />);
    const headings = screen
      .getAllByRole("heading")
      .map((h) => h.textContent ?? "");
    const order = [
      "Stop retyping your screen.",
      "The busywork nobody signed up for",
      "One drag. Dam, done.",
      "paste it into ChatGPT",
      "Your data sleeps at home.",
      "It doesn't care where it came from.",
      "Give your Mac a beaver.",
    ].map((needle) => headings.findIndex((h) => h.includes(needle)));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows four busywork stickers and a broader spread of use-case chips", () => {
    render(<App />);
    expect(screen.getAllByTestId("pain-sticker")).toHaveLength(4);
    expect(screen.getAllByTestId("use-case").length).toBeGreaterThan(4);
  });

  it("offers a download CTA in the nav and the closer", () => {
    render(<App />);
    const downloads = screen.getAllByRole("link", {
      name: "Download for Mac",
    });
    expect(downloads.length).toBeGreaterThanOrEqual(2);
    for (const link of downloads) {
      expect(link).toHaveAttribute("href", RELEASES_URL);
    }
  });

  it("cites its sources with real, directly-linked references", () => {
    render(<App />);
    const sources = screen.getByTestId("sources");
    const links = sources.querySelectorAll("a[href^='https://']");
    expect(links).toHaveLength(2);
  });

  it("links to the repo, security policy, and roadmap in the footer", () => {
    render(<App />);
    const footer = screen.getByRole("contentinfo");
    const hrefs = Array.from(footer.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain(GITHUB_URL);
    expect(hrefs.some((h) => h?.includes("SECURITY.md"))).toBe(true);
    expect(hrefs.some((h) => h?.includes("ROADMAP.md"))).toBe(true);
  });
});
