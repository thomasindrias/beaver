import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArgumentSection } from "../components/ArgumentSection";
import { stubMatchMedia } from "./helpers";

describe("ArgumentSection", () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => vi.unstubAllGlobals());

  it("asks the question people actually ask", () => {
    render(<ArgumentSection />);
    expect(
      screen.getByRole("heading", { name: /paste it into ChatGPT/ }),
    ).toBeInTheDocument();
  });

  it("itemizes the token receipt for both paths", () => {
    render(<ArgumentSection />);
    expect(screen.getByText("1,928 tk")).toBeInTheDocument();
    expect(screen.getByText("184 tk")).toBeInTheDocument();
    expect(screen.getByText(/90%\+/)).toBeInTheDocument();
  });

  it("makes the three arguments against sending screenshots", () => {
    render(<ArgumentSection />);
    expect(screen.getByText("You pay by the pixel")).toBeInTheDocument();
    expect(
      screen.getByText("The model reads a shrunk copy"),
    ).toBeInTheDocument();
    expect(screen.getByText("It guesses, confidently")).toBeInTheDocument();
  });

  it("makes the guessing point vivid without an unverifiable stat", () => {
    render(<ArgumentSection />);
    expect(
      screen.getByText(/hallucinated digit prints in the exact same font/),
    ).toBeInTheDocument();
  });

  it("closes with the tenth-of-the-tokens claim", () => {
    render(<ArgumentSection />);
    expect(
      screen.getByText(/exact text at a tenth of the tokens/),
    ).toBeInTheDocument();
  });
});
