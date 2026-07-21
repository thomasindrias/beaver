import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CaptureDemo } from "../components/CaptureDemo";
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

function enterView() {
  act(() => {
    FakeIntersectionObserver.instances[0].trigger(true);
  });
}

describe("CaptureDemo", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits until it scrolls into view before capturing anything", () => {
    render(<CaptureDemo />);
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByTestId("exhibit-markdown").textContent).not.toMatch(
      /Business/,
    );
  });

  it("types the Markdown onto the clipboard once it's in view", () => {
    render(<CaptureDemo />);
    enterView();
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByTestId("exhibit-markdown").textContent).toMatch(
      /Business.*\|.*50/,
    );
  });

  it("replays the capture from the start when the replay button is clicked", () => {
    render(<CaptureDemo />);
    enterView();
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByTestId("exhibit-markdown").textContent).toMatch(
      /Business.*\|.*50/,
    );

    fireEvent.click(screen.getByRole("button", { name: /replay capture/i }));
    expect(screen.getByTestId("exhibit-markdown").textContent).not.toMatch(
      /Business/,
    );

    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByTestId("exhibit-markdown").textContent).toMatch(
      /Business.*\|.*50/,
    );
  });

  it("shows the full result immediately and skips the wait and the replay control when motion is reduced", () => {
    stubMatchMedia(true);
    render(<CaptureDemo />);
    expect(screen.getByTestId("exhibit-markdown").textContent).toMatch(
      /Business.*\|.*50/,
    );
    expect(
      screen.queryByRole("button", { name: /replay capture/i }),
    ).not.toBeInTheDocument();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });
});
