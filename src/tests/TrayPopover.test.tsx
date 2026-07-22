import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const { invokeMock, focusHandlers } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  focusHandlers: [] as Array<(e: { payload: boolean }) => void>,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: (handler: (e: { payload: boolean }) => void) => {
      focusHandlers.push(handler);
      return Promise.resolve(() => {});
    },
  }),
}));

const { selectMock, executeMock } = vi.hoisted(() => ({
  selectMock: vi.fn().mockResolvedValue([]),
  executeMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn().mockResolvedValue({ select: selectMock, execute: executeMock }),
  },
}));

import { TrayPopover } from "../components/TrayPopover";

const BASE_SETTINGS = {
  default_format: "text",
  shortcut: "CmdOrCtrl+Shift+D",
  history_retention_days: null,
  update_check_enabled: true,
};

describe("TrayPopover", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return BASE_SETTINGS;
      return [];
    });
  });

  it("opens Settings when the gear icon is clicked", async () => {
    render(<TrayPopover />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    expect(invokeMock).toHaveBeenCalledWith("open_settings");
  });

  it("shows the configured shortcut's glyphs in the footer", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") {
        return { ...BASE_SETTINGS, shortcut: "CmdOrCtrl+Shift+X" };
      }
      return [];
    });

    render(<TrayPopover />);

    const footerHint = await screen.findByText("to capture anywhere");
    const scope = within(footerHint.closest("footer") as HTMLElement);

    expect(scope.getByText("⌘")).toBeInTheDocument();
    expect(scope.getByText("⇧")).toBeInTheDocument();
    expect(scope.getByText("X")).toBeInTheDocument();
    expect(scope.queryByText("D")).not.toBeInTheDocument();
  });
});
