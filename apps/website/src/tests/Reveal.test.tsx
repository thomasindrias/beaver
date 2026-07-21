import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Reveal } from "../components/Reveal";
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

describe("Reveal", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders children immediately, before it has entered view", () => {
    render(<Reveal>Boxed table</Reveal>);
    expect(screen.getByText("Boxed table")).toBeInTheDocument();
  });

  it("starts hidden and becomes visible once it scrolls into view", () => {
    render(<Reveal>Boxed table</Reveal>);
    expect(screen.getByTestId("reveal")).toHaveAttribute(
      "data-visible",
      "false",
    );

    act(() => {
      FakeIntersectionObserver.instances[0].trigger(true);
    });

    expect(screen.getByTestId("reveal")).toHaveAttribute(
      "data-visible",
      "true",
    );
  });

  it("shows immediately without watching for intersection when motion is reduced", () => {
    stubMatchMedia(true);
    render(<Reveal>Boxed table</Reveal>);
    expect(screen.getByTestId("reveal")).toHaveAttribute(
      "data-visible",
      "true",
    );
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("takes a custom test id for the wrapped card", () => {
    render(<Reveal testId="pain-sticker">Card</Reveal>);
    expect(screen.getByTestId("pain-sticker")).toBeInTheDocument();
  });
});
