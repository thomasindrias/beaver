import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmailCapture } from "../components/EmailCapture";

describe("EmailCapture", () => {
  it("posts to Buttondown's embed-subscribe endpoint for the given username", () => {
    const { container } = render(<EmailCapture username="beaver-test" />);
    const form = container.querySelector("form")!;
    expect(form).toHaveAttribute(
      "action",
      "https://buttondown.com/api/emails/embed-subscribe/beaver-test",
    );
    expect(form).toHaveAttribute("method", "post");
  });

  it("carries the hidden embed field Buttondown's form contract requires", () => {
    const { container } = render(<EmailCapture username="beaver-test" />);
    const embedField = container.querySelector('input[name="embed"]');
    expect(embedField).toHaveAttribute("value", "1");
  });

  it("has a labeled, required email input", () => {
    render(<EmailCapture username="beaver-test" />);
    const emailInput = screen.getByLabelText("Email address");
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveAttribute("name", "email");
    expect(emailInput).toBeRequired();
  });

  it("states the value prop with no spam promise", () => {
    render(<EmailCapture username="beaver-test" />);
    expect(screen.getByText("New releases, no spam.")).toBeInTheDocument();
  });

  it("has a submit button", () => {
    render(<EmailCapture username="beaver-test" />);
    expect(screen.getByRole("button", { name: "Get updates" })).toHaveAttribute(
      "type",
      "submit",
    );
  });
});
