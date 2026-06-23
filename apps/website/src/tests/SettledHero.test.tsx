import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettledHero } from "../components/SettledHero";
import { heroCopy, RELEASES_URL } from "../constants";

describe("SettledHero", () => {
  it("renders the headline and subhead", () => {
    render(<SettledHero autoPlayVideo />);
    expect(screen.getByText(heroCopy.headline)).toBeInTheDocument();
    expect(screen.getByText(heroCopy.subhead)).toBeInTheDocument();
  });

  it("renders the qualifier line", () => {
    render(<SettledHero autoPlayVideo />);
    expect(screen.getByText(heroCopy.qualifier)).toBeInTheDocument();
  });

  it("renders the CTA as a safe external link to GitHub Releases", () => {
    render(<SettledHero autoPlayVideo />);
    const cta = screen.getByRole("link", { name: heroCopy.cta });
    expect(cta).toHaveAttribute("href", RELEASES_URL);
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("marks the looping video as decorative", () => {
    render(<SettledHero autoPlayVideo />);
    const video = document.querySelector("video");
    expect(video).toHaveAttribute("aria-hidden", "true");
  });

  it("does not autoplay the video when autoPlayVideo is false", () => {
    render(<SettledHero autoPlayVideo={false} />);
    const video = document.querySelector("video");
    expect(video).not.toHaveAttribute("autoplay");
  });
});
