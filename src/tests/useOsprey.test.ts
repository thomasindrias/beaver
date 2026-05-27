import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("## Extracted content"),
}));

import { useOsprey } from "../hooks/useOsprey";

describe("useOsprey", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => useOsprey());
    expect(result.current.state).toBe("idle");
  });

  it("exposes runCapture function", () => {
    const { result } = renderHook(() => useOsprey());
    expect(typeof result.current.runCapture).toBe("function");
  });
});
