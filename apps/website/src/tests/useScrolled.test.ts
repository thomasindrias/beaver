import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScrolled } from "../hooks/useScrolled";

function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
}

describe("useScrolled", () => {
  afterEach(() => setScrollY(0));

  it("is false at the top of the page", () => {
    setScrollY(0);
    const { result } = renderHook(() => useScrolled());
    expect(result.current).toBe(false);
  });

  it("becomes true once scrolled past the threshold", () => {
    setScrollY(0);
    const { result } = renderHook(() => useScrolled(8));
    act(() => {
      setScrollY(40);
      window.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toBe(true);
  });

  it("returns to false when scrolled back to the top", () => {
    setScrollY(40);
    const { result } = renderHook(() => useScrolled(8));
    act(() => {
      setScrollY(0);
      window.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toBe(false);
  });
});
