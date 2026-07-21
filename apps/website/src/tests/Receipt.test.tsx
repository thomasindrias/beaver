import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Receipt } from "../components/Receipt";
import { stubMatchMedia } from "./helpers";

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

describe("Receipt", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("itemizes both paths regardless of animation state", () => {
    render(<Receipt />);
    expect(screen.getByText("1,928 tk")).toBeInTheDocument();
    expect(screen.getByText("184 tk")).toBeInTheDocument();
    expect(screen.getByText(/90%\+/)).toBeInTheDocument();
  });

  it("discloses what the screenshot side is actually measuring", () => {
    render(<Receipt />);
    expect(
      screen.getByText(/full window, not a tight crop/i),
    ).toBeInTheDocument();
  });

  it("staggers each row's entrance with an increasing delay, once in view", () => {
    render(<Receipt />);
    const rows = screen.getAllByTestId("receipt-row");
    expect(rows[0]).toHaveStyle({ transitionDelay: "0ms" });
    expect(rows[1]).toHaveStyle({ transitionDelay: "90ms" });
    // Not visible yet.
    expect(rows[0]).toHaveAttribute("data-visible", "false");

    act(() => {
      FakeIntersectionObserver.instances[0].trigger(true);
    });

    expect(rows[0]).toHaveAttribute("data-visible", "true");
    expect(rows[rows.length - 1]).toHaveAttribute("data-visible", "true");
  });

  it("shows every row immediately, with no stagger, when motion is reduced", () => {
    stubMatchMedia(true);
    render(<Receipt />);
    const rows = screen.getAllByTestId("receipt-row");
    for (const row of rows) {
      expect(row).toHaveAttribute("data-visible", "true");
    }
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });
});
