import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { useBeaver, SUCCESS_DWELL_MS } from "../hooks/useBeaver";

const region = { x: 0, y: 0, width: 10, height: 10 };

describe("useBeaver", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue("## Extracted content");
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => useBeaver());
    expect(result.current.state).toBe("idle");
  });

  it("exposes runCapture function", () => {
    const { result } = renderHook(() => useBeaver());
    expect(typeof result.current.runCapture).toBe("function");
  });

  it("copies the extracted text to the clipboard", async () => {
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(invokeMock).toHaveBeenCalledWith("write_to_clipboard", {
      text: "## Extracted content",
    });
  });

  it("does not fire the native OS notification (the in-app toast replaces it)", async () => {
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(invokeMock).not.toHaveBeenCalledWith("show_success_notification");
  });

  it("calls onComplete after the success dwell", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBeaver(undefined, onComplete));

    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.state).toBe("success");
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SUCCESS_DWELL_MS);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("idle");
    vi.useRealTimers();
  });
});
