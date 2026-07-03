import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

type FocusHandler = (event: { payload: boolean }) => void;

const { invokeMock, focusHandlers } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  focusHandlers: [] as FocusHandler[],
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: (handler: FocusHandler) => {
      focusHandlers.push(handler);
      return Promise.resolve(() => {
        const i = focusHandlers.indexOf(handler);
        if (i >= 0) focusHandlers.splice(i, 1);
      });
    },
  }),
}));

function emitFocus(focused: boolean) {
  focusHandlers.forEach(h => h({ payload: focused }));
}

import { UpdatePill } from "../components/UpdatePill";

describe("UpdatePill", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    focusHandlers.length = 0;
  });

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

  // The popover window is hidden/shown for weeks at a time rather than
  // recreated, so a mount-only check would never run again after the first
  // open. Re-checking on focus is what makes the "once a day" cache on the
  // Rust side actually get exercised daily.
  it("re-checks for an update every time the window regains focus", async () => {
    invokeMock.mockResolvedValue(null);
    render(<UpdatePill />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("check_for_update"));
    expect(invokeMock).toHaveBeenCalledTimes(1);

    emitFocus(true);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock).toHaveBeenLastCalledWith("check_for_update");
  });

  it("does not re-check when the window loses focus", async () => {
    invokeMock.mockResolvedValue(null);
    render(<UpdatePill />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("check_for_update"));
    invokeMock.mockClear();

    emitFocus(false);
    await new Promise(r => setTimeout(r, 10));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("stops listening for focus changes after unmount", async () => {
    invokeMock.mockResolvedValue(null);
    const { unmount } = render(<UpdatePill />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("check_for_update"));
    expect(focusHandlers).toHaveLength(1);

    unmount();
    await waitFor(() => expect(focusHandlers).toHaveLength(0));
  });
});
