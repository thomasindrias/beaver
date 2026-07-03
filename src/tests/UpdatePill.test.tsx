import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { UpdatePill } from "../components/UpdatePill";

describe("UpdatePill", () => {
  beforeEach(() => invokeMock.mockReset());

  it("renders nothing when up to date", async () => {
    invokeMock.mockResolvedValue(null);
    const { container } = render(<UpdatePill />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("check_for_update"));
    expect(container).toBeEmptyDOMElement();
  });

  it("links to the release when an update exists", async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === "check_for_update"
        ? { version: "0.2.0", url: "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0" }
        : undefined
    );
    render(<UpdatePill />);

    const pill = await screen.findByRole("button", { name: /v0\.2\.0 available/i });
    fireEvent.click(pill);
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_external", {
        url: "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0",
      })
    );
  });
});
