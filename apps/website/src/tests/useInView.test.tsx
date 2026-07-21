import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useInView } from "../hooks/useInView";
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

function Probe() {
  const { ref, inView } = useInView();
  return <div ref={ref} data-testid="probe" data-in-view={inView} />;
}

describe("useInView", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("starts out of view, then flips true once the ref'd node intersects", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveAttribute(
      "data-in-view",
      "false",
    );

    act(() => {
      FakeIntersectionObserver.instances[0].trigger(true);
    });

    expect(screen.getByTestId("probe")).toHaveAttribute(
      "data-in-view",
      "true",
    );
  });

  it("starts already in view when motion is reduced, without observing anything", () => {
    stubMatchMedia(true);
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveAttribute(
      "data-in-view",
      "true",
    );
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("falls back to in-view immediately when IntersectionObserver is unavailable", () => {
    vi.unstubAllGlobals();
    stubMatchMedia(false);
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveAttribute(
      "data-in-view",
      "true",
    );
  });
});
