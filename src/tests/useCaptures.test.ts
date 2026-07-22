import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { selectMock, executeMock } = vi.hoisted(() => ({
  selectMock: vi.fn().mockResolvedValue([]),
  executeMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn().mockResolvedValue({ select: selectMock, execute: executeMock }),
  },
}));

import { useCaptures } from "../hooks/useCaptures";

describe("useCaptures retention", () => {
  beforeEach(() => {
    selectMock.mockClear();
    executeMock.mockClear();
  });

  it("does not prune when retentionDays is null", async () => {
    const { result } = renderHook(() =>
      useCaptures({ autoLoad: false, retentionDays: null })
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(executeMock).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalled();
  });

  it("prunes captures older than retentionDays before selecting", async () => {
    const { result } = renderHook(() =>
      useCaptures({ autoLoad: false, retentionDays: 30 })
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(executeMock).toHaveBeenCalledWith(
      "DELETE FROM captures WHERE created_at < ?",
      [expect.any(String)]
    );
    // Pruning must run before the select that follows it.
    const deleteOrder = executeMock.mock.invocationCallOrder[0];
    const selectOrder = selectMock.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(selectOrder);
  });
});
