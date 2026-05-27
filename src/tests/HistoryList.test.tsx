import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryList } from "../components/HistoryList";
import type { Capture } from "../types";

const captures: Capture[] = [
  { id: "1", created_at: new Date().toISOString(), content: "Hello", content_type: "prose", char_count: 5, app_context: null },
  { id: "2", created_at: new Date().toISOString(), content: "| a | b |\n|---|---|\n| 1 | 2 |", content_type: "table", char_count: 30, app_context: "Finder" },
];

describe("HistoryList", () => {
  it("renders all captures", () => {
    render(<HistoryList captures={captures} />);
    expect(screen.getAllByRole("button", { name: /copy/i })).toHaveLength(2);
  });

  it("shows empty state message", () => {
    render(<HistoryList captures={[]} />);
    expect(screen.getByText(/No captures yet/i)).toBeInTheDocument();
  });
});
