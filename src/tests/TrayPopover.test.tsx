import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

describe("TrayPopover", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue([]);
  });

  it("opens Settings when the gear icon is clicked", async () => {
    render(<TrayPopover />);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    expect(invokeMock).toHaveBeenCalledWith("open_settings");
  });
});
