import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import {
  CursorToast,
  LOADING_MESSAGES,
  MESSAGE_ROTATE_MS,
} from "../components/CursorToast";

describe("CursorToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("shows a loading message while processing", () => {
    render(<CursorToast state="processing" origin={{ x: 100, y: 100 }} />);
    const shown = LOADING_MESSAGES.some((m) => screen.queryByText(m) !== null);
    expect(shown).toBe(true);
  });

  it("rotates to a different loading message after the interval", () => {
    const { container } = render(
      <CursorToast state="processing" origin={{ x: 100, y: 100 }} />
    );
    const text = () => container.querySelector("span")?.textContent;
    const before = text();

    act(() => {
      vi.advanceTimersByTime(MESSAGE_ROTATE_MS);
    });

    const after = text();
    expect(after).not.toBe(before);
    expect(LOADING_MESSAGES).toContain(after);
  });

  // Many puns are wasted if every capture starts on the same one, so the
  // opening line is picked at random. Teeth: with Math.random pinned mid-range
  // we must land on that message, not the hard-coded first entry.
  it("starts on a message chosen by Math.random", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    render(<CursorToast state="processing" origin={{ x: 0, y: 0 }} />);
    const expected = LOADING_MESSAGES[Math.floor(0.5 * LOADING_MESSAGES.length)];
    expect(screen.getByText(expected)).toBeInTheDocument();
    randomSpy.mockRestore();
  });

  it("shows the success message when state is success", () => {
    render(<CursorToast state="success" origin={{ x: 0, y: 0 }} />);
    expect(screen.getByText(/copied to clipboard/i)).toBeInTheDocument();
  });

  it("shows an error message when state is error", () => {
    render(<CursorToast state="error" origin={{ x: 0, y: 0 }} />);
    expect(screen.getByText(/couldn.t read/i)).toBeInTheDocument();
  });

  it("renders nothing when idle", () => {
    const { container } = render(
      <CursorToast state="idle" origin={{ x: 0, y: 0 }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("explains the fix when the error is a missing permission", () => {
    render(<CursorToast state="error" errorKind="permission" origin={{ x: 0, y: 0 }} />);
    expect(screen.getByText(/screen recording access/i)).toBeInTheDocument();
  });

  it("anchors near the origin point", () => {
    const { container } = render(
      <CursorToast state="processing" origin={{ x: 120, y: 80 }} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.left).not.toBe("");
    expect(el.style.top).not.toBe("");
  });

  it("follows the cursor on mousemove", () => {
    const { container } = render(
      <CursorToast state="processing" origin={{ x: 10, y: 10 }} />
    );
    const el = container.firstChild as HTMLElement;
    const before = el.style.left;

    act(() => {
      fireEvent.mouseMove(window, { clientX: 320, clientY: 240 });
    });

    expect(el.style.left).not.toBe(before);
    expect(el.style.left).toContain("336"); // 320 + offset
  });
});
