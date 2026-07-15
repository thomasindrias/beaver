import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

type FocusHandler = (event: { payload: boolean }) => void;

const { invokeMock, focusHandlers, checkMock, relaunchMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  focusHandlers: [] as FocusHandler[],
  checkMock: vi.fn(),
  relaunchMock: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: checkMock }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: relaunchMock }));
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

const RELEASE_URL = "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0";

function mockUpdateAvailable() {
  invokeMock.mockImplementation(async (cmd: string) =>
    cmd === "check_for_update" ? { version: "0.2.0", url: RELEASE_URL } : undefined
  );
}

describe("UpdatePill visibility (passive check)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    checkMock.mockReset();
    relaunchMock.mockReset();
    focusHandlers.length = 0;
  });

  it("renders nothing when up to date", async () => {
    invokeMock.mockResolvedValue(null);
    const { container } = render(<UpdatePill />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("check_for_update"));
    expect(container).toBeEmptyDOMElement();
  });

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

describe("UpdatePill one-click update", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    checkMock.mockReset();
    relaunchMock.mockReset();
    relaunchMock.mockResolvedValue(undefined);
    focusHandlers.length = 0;
    mockUpdateAvailable();
  });

  it("downloads with progress and offers a restart", async () => {
    checkMock.mockResolvedValue({
      downloadAndInstall: async (cb: (e: unknown) => void) => {
        cb({ event: "Started", data: { contentLength: 200 } });
        cb({ event: "Progress", data: { chunkLength: 100 } });
        cb({ event: "Finished" });
      },
    });
    render(<UpdatePill />);

    fireEvent.click(await screen.findByRole("button", { name: "Update to v0.2.0" }));

    expect(await screen.findByRole("button", { name: "Restart to update" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart to update" }));
    await waitFor(() => expect(relaunchMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).not.toHaveBeenCalledWith("open_external", expect.anything());
  });

  it("shows download progress as a percentage", async () => {
    let emit: ((e: unknown) => void) | null = null;
    let finish: (() => void) | null = null;
    checkMock.mockResolvedValue({
      downloadAndInstall: (cb: (e: unknown) => void) =>
        new Promise<void>(resolve => {
          emit = cb;
          finish = resolve;
        }),
    });
    render(<UpdatePill />);

    fireEvent.click(await screen.findByRole("button", { name: "Update to v0.2.0" }));
    await waitFor(() => expect(emit).not.toBeNull());
    emit!({ event: "Started", data: { contentLength: 200 } });
    emit!({ event: "Progress", data: { chunkLength: 100 } });

    expect(await screen.findByText("Downloading… 50%")).toBeInTheDocument();
    finish!();
  });

  it("falls back to the release page when no updater manifest exists", async () => {
    checkMock.mockResolvedValue(null);
    render(<UpdatePill />);

    fireEvent.click(await screen.findByRole("button", { name: "Update to v0.2.0" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_external", { url: RELEASE_URL })
    );
    expect(screen.getByRole("button", { name: "Update to v0.2.0" })).toBeInTheDocument();
  });

  it("falls back to the release page when the download fails", async () => {
    checkMock.mockResolvedValue({
      downloadAndInstall: async () => {
        throw new Error("network");
      },
    });
    render(<UpdatePill />);

    fireEvent.click(await screen.findByRole("button", { name: "Update to v0.2.0" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_external", { url: RELEASE_URL })
    );
  });
});
