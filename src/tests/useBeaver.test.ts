import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { useBeaver, SUCCESS_DWELL_MS, ERROR_DWELL_MS } from "../hooks/useBeaver";

const region = { x: 0, y: 0, width: 10, height: 10 };

// capture_and_extract / re_extract resolve to an ExtractionResult, not a bare
// string. The engine defaults to local since these tests are about the capture
// lifecycle, not engine selection.
const extraction = (text: string, engine: "local" | "cloud" = "local") => ({ text, engine });

describe("useBeaver", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue(extraction("## Extracted content"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle with markdown as the active format", () => {
    const { result } = renderHook(() => useBeaver());
    expect(result.current.state).toBe("idle");
    expect(result.current.format).toBe("markdown");
  });

  it("requests markdown on the first capture and copies the result", async () => {
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(invokeMock).toHaveBeenCalledWith("capture_and_extract", {
      region,
      format: "markdown",
    });
    expect(invokeMock).toHaveBeenCalledWith("write_to_clipboard", {
      text: "## Extracted content",
    });
    expect(result.current.state).toBe("success");
  });

  it("detects the content type for the copied pill label", async () => {
    invokeMock.mockResolvedValue(extraction("| a | b |\n|---|---|\n| 1 | 2 |"));
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.contentType).toBe("table");
  });

  it("auto-dismisses after the success dwell when not engaged", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBeaver(undefined, onComplete));
    await act(async () => {
      await result.current.runCapture(region);
    });
    act(() => {
      vi.advanceTimersByTime(SUCCESS_DWELL_MS);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("idle");
  });

  it("engage() cancels the auto-dismiss", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBeaver(undefined, onComplete));
    await act(async () => {
      await result.current.runCapture(region);
    });
    act(() => {
      result.current.engage();
      vi.advanceTimersByTime(SUCCESS_DWELL_MS * 4);
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(result.current.state).toBe("success");
  });

  it("reExtract re-runs with the new format and re-copies", async () => {
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    invokeMock.mockClear().mockResolvedValue(extraction("a,b\n1,2"));
    await act(async () => {
      await result.current.reExtract("csv");
    });
    expect(invokeMock).toHaveBeenCalledWith("re_extract", {
      format: "csv",
      hint: null,
    });
    expect(invokeMock).toHaveBeenCalledWith("write_to_clipboard", {
      text: "a,b\n1,2",
    });
    expect(result.current.format).toBe("csv");
    expect(result.current.state).toBe("success");
  });

  it("reExtract passes the custom hint through", async () => {
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
      await result.current.reExtract("csv", "headers are dates");
    });
    expect(invokeMock).toHaveBeenCalledWith("re_extract", {
      format: "csv",
      hint: "headers are dates",
    });
  });

  it("saves to history only for the first successful extraction", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBeaver(onSave));
    await act(async () => {
      await result.current.runCapture(region);
      await result.current.reExtract("csv");
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("flags permission errors and keeps others generic", async () => {
    invokeMock.mockRejectedValue("screen-permission-missing");
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.state).toBe("error");
    expect(result.current.errorKind).toBe("permission");
  });

  it("keeps non-permission errors generic", async () => {
    invokeMock.mockRejectedValue("MLX request failed: boom");
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.state).toBe("error");
    expect(result.current.errorKind).toBe("generic");
  });

  it("never surfaces the internal local-engine diagnostic as a message", async () => {
    invokeMock.mockRejectedValue("MLX request failed: boom");
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.errorMessage).toBeNull();
  });

  it("flags cloud errors and strips the sentinel prefix into a user-facing message", async () => {
    invokeMock.mockRejectedValue("cloud-error:Provider rejected the API key");
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.state).toBe("error");
    expect(result.current.errorKind).toBe("cloud");
    expect(result.current.errorMessage).toBe("Provider rejected the API key");
  });

  it("does not treat a sentinel merely embedded mid-string as a cloud error", async () => {
    // The Rust contract emits the sentinel only at position 0 (cloud.rs uses
    // strip_prefix). A local-engine diagnostic that happens to contain the
    // same substring further in must stay generic and hidden — that's the
    // internal-diagnostic leak the sentinel exists to prevent.
    invokeMock.mockRejectedValue("MLX request failed: cloud-error:leaked internal detail");
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.state).toBe("error");
    expect(result.current.errorKind).toBe("generic");
    expect(result.current.errorMessage).toBeNull();
  });

  it("keeps errorMessage null for permission errors", async () => {
    invokeMock.mockRejectedValue("screen-permission-missing");
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.errorKind).toBe("permission");
    expect(result.current.errorMessage).toBeNull();
  });

  it("errors auto-dismiss after the error dwell when not engaged", async () => {
    vi.useFakeTimers();
    invokeMock.mockRejectedValue("MLX request failed: boom");
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBeaver(undefined, onComplete));
    await act(async () => {
      await result.current.runCapture(region);
    });
    act(() => {
      vi.advanceTimersByTime(ERROR_DWELL_MS);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("retry re-runs the last region", async () => {
    invokeMock.mockRejectedValueOnce("MLX request failed: boom");
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.state).toBe("error");
    invokeMock.mockResolvedValue(extraction("recovered"));
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.state).toBe("success");
  });

  it("dismiss goes idle and fires onComplete", async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBeaver(undefined, onComplete));
    await act(async () => {
      await result.current.runCapture(region);
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.state).toBe("idle");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale re_extract response that lands after a newer one", async () => {
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    let rejectFirst: (e: unknown) => void;
    invokeMock.mockImplementationOnce(
      () => new Promise((_, reject) => { rejectFirst = reject; })
    );
    let first: Promise<void>;
    act(() => {
      first = result.current.reExtract("csv");
    });
    invokeMock.mockResolvedValue(extraction("second result"));
    await act(async () => {
      await result.current.reExtract("json");
    });
    expect(result.current.state).toBe("success");
    await act(async () => {
      rejectFirst!("MLX request failed: slow timeout");
      await first!.catch(() => {});
    });
    expect(result.current.state).toBe("success");
    expect(result.current.format).toBe("json");
  });

  it("a response landing after dismiss neither writes the clipboard nor revives state", async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBeaver(undefined, onComplete));
    await act(async () => {
      await result.current.runCapture(region);
    });
    let resolveLate: (v: { text: string; engine: string }) => void;
    invokeMock.mockImplementationOnce(
      () => new Promise(resolve => { resolveLate = resolve; })
    );
    let pending: Promise<void>;
    act(() => {
      pending = result.current.reExtract("csv");
    });
    act(() => {
      result.current.dismiss();
    });
    invokeMock.mockClear();
    await act(async () => {
      resolveLate!(extraction("late content"));
      await pending!;
    });
    expect(invokeMock).not.toHaveBeenCalledWith("write_to_clipboard", { text: "late content" });
    expect(result.current.state).toBe("idle");
  });

  it("exposes the engine reported by the capture", async () => {
    invokeMock.mockResolvedValue(extraction("hello", "cloud"));
    const { result } = renderHook(() => useBeaver());
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.engine).toBe("cloud");
  });

  it("starts with no known engine before any capture", () => {
    const { result } = renderHook(() => useBeaver());
    expect(result.current.engine).toBeNull();
  });

  it("ignores the engine from a superseded capture", async () => {
    // A slow cloud capture outlived by a fast local one must not repaint the
    // indicator for the local result the user is already looking at.
    const { result } = renderHook(() => useBeaver());
    let resolveSlow: (v: { text: string; engine: string }) => void;
    invokeMock.mockImplementationOnce(
      () => new Promise(resolve => { resolveSlow = resolve; })
    );
    let slow: Promise<void>;
    act(() => {
      slow = result.current.runCapture(region);
    });

    invokeMock.mockResolvedValue(extraction("local result", "local"));
    await act(async () => {
      await result.current.runCapture(region);
    });
    expect(result.current.engine).toBe("local");

    await act(async () => {
      resolveSlow!({ text: "cloud result", engine: "cloud" });
      await slow!.catch(() => {});
    });
    expect(result.current.engine).toBe("local");
  });
});
