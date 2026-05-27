import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CaptureEntry } from "../components/CaptureEntry";
import type { Capture } from "../types";

const mockCapture: Capture = {
  id: "1",
  created_at: new Date().toISOString(),
  content: "| Name | Value |\n|---|---|\n| foo | bar |",
  content_type: "table",
  char_count: 40,
  app_context: "Safari",
};

describe("CaptureEntry", () => {
  it("shows content type badge", () => {
    render(<CaptureEntry capture={mockCapture} onCopy={vi.fn()} />);
    expect(screen.getByText("table")).toBeInTheDocument();
  });

  it("shows app context", () => {
    render(<CaptureEntry capture={mockCapture} onCopy={vi.fn()} />);
    expect(screen.getByText("Safari")).toBeInTheDocument();
  });

  it("calls onCopy with content on click", () => {
    const onCopy = vi.fn();
    render(<CaptureEntry capture={mockCapture} onCopy={onCopy} />);
    screen.getByRole("button", { name: /copy/i }).click();
    expect(onCopy).toHaveBeenCalledWith(mockCapture.content);
  });
});
