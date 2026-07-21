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

function settle() {
  act(() => {
    vi.runAllTimers();
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
    settle();
    expect(screen.getByTestId("exhibit-output").textContent).not.toMatch(
      /Business/,
    );
  });

  it("types the Markdown onto the clipboard once it's in view", () => {
    render(<CaptureDemo />);
    enterView();
    settle();
    expect(screen.getByTestId("exhibit-output").textContent).toMatch(
      /Business.*\|.*50/,
    );
  });

  it("replays the capture from the start when the replay button is clicked", () => {
    render(<CaptureDemo />);
    enterView();
    settle();
    expect(screen.getByTestId("exhibit-output").textContent).toMatch(
      /Business.*\|.*50/,
    );

    fireEvent.click(screen.getByRole("button", { name: /replay capture/i }));
    expect(screen.getByTestId("exhibit-output").textContent).not.toMatch(
      /Business/,
    );

    settle();
    expect(screen.getByTestId("exhibit-output").textContent).toMatch(
      /Business.*\|.*50/,
    );
  });

  it("shows the full result immediately and skips the wait and the replay control when motion is reduced", () => {
    stubMatchMedia(true);
    render(<CaptureDemo />);
    expect(screen.getByTestId("exhibit-output").textContent).toMatch(
      /Business.*\|.*50/,
    );
    expect(
      screen.queryByRole("button", { name: /replay capture/i }),
    ).not.toBeInTheDocument();
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  describe("format switching", () => {
    it("offers four formats, with Markdown selected by default", () => {
      render(<CaptureDemo />);
      const group = screen.getByRole("group", { name: /output format/i });
      expect(group).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Markdown" }),
      ).toHaveAttribute("aria-pressed", "true");
      for (const label of ["CSV", "JSON", "Plain"]) {
        expect(screen.getByRole("button", { name: label })).toHaveAttribute(
          "aria-pressed",
          "false",
        );
      }
    });

    it("disables the format chips until the initial capture has settled", () => {
      render(<CaptureDemo />);
      enterView();
      expect(screen.getByRole("button", { name: "JSON" })).toBeDisabled();
      settle();
      expect(screen.getByRole("button", { name: "JSON" })).not.toBeDisabled();
    });

    it("swaps the clipboard content instantly when a different format is picked", () => {
      render(<CaptureDemo />);
      enterView();
      settle();

      fireEvent.click(screen.getByRole("button", { name: "JSON" }));

      expect(screen.getByTestId("exhibit-output").textContent).toMatch(
        /"Plan": "Starter"/,
      );
      expect(screen.getByRole("button", { name: "JSON" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(
        screen.getByRole("button", { name: "Markdown" }),
      ).toHaveAttribute("aria-pressed", "false");
    });

    it("shows CSV and Plain with their own distinct shapes, not Markdown's", () => {
      render(<CaptureDemo />);
      enterView();
      settle();

      fireEvent.click(screen.getByRole("button", { name: "CSV" }));
      expect(screen.getByTestId("exhibit-output").textContent).toMatch(
        /Plan,Seats,Price/,
      );

      fireEvent.click(screen.getByRole("button", { name: "Plain" }));
      const plainText = screen.getByTestId("exhibit-output").textContent ?? "";
      expect(plainText).not.toMatch(/\| Plan|Plan,Seats,Price/);
      expect(plainText).toMatch(/Starter — 1 seat/);
    });

    it("leaves the on-screen source table alone when the output format changes", () => {
      render(<CaptureDemo />);
      enterView();
      settle();

      fireEvent.click(screen.getByRole("button", { name: "JSON" }));

      expect(screen.getByText("on your screen")).toBeInTheDocument();
      expect(screen.getByRole("cell", { name: "Business" })).toBeInTheDocument();
    });

    it("replays whatever format is currently selected, not always Markdown", () => {
      render(<CaptureDemo />);
      enterView();
      settle();
      fireEvent.click(screen.getByRole("button", { name: "JSON" }));

      fireEvent.click(screen.getByRole("button", { name: /replay capture/i }));
      settle();

      expect(screen.getByTestId("exhibit-output").textContent).toMatch(
        /"Plan": "Starter"/,
      );
    });

    it("makes every format chip usable immediately when motion is reduced", () => {
      stubMatchMedia(true);
      render(<CaptureDemo />);
      expect(screen.getByRole("button", { name: "JSON" })).not.toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "JSON" }));
      expect(screen.getByTestId("exhibit-output").textContent).toMatch(
        /"Plan": "Starter"/,
      );
    });
  });
});
