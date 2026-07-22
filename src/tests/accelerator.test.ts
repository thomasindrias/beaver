import { describe, it, expect } from "vitest";
import { toAccelerator, acceleratorToGlyphs } from "../lib/accelerator";

function key(overrides: Partial<Parameters<typeof toAccelerator>[0]>) {
  return {
    key: "d",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("toAccelerator", () => {
  it("translates Cmd+Shift+D", () => {
    expect(toAccelerator(key({ key: "d", metaKey: true, shiftKey: true }))).toBe(
      "CmdOrCtrl+Shift+D"
    );
  });

  it("translates Ctrl+Shift+X the same as Cmd (CmdOrCtrl)", () => {
    expect(toAccelerator(key({ key: "x", ctrlKey: true, shiftKey: true }))).toBe(
      "CmdOrCtrl+Shift+X"
    );
  });

  it("includes Alt when held", () => {
    expect(
      toAccelerator(key({ key: "p", metaKey: true, altKey: true }))
    ).toBe("CmdOrCtrl+Alt+P");
  });

  it("returns null for a bare modifier keypress", () => {
    expect(toAccelerator(key({ key: "Meta", metaKey: true }))).toBeNull();
    expect(toAccelerator(key({ key: "Shift", shiftKey: true }))).toBeNull();
  });

  it("returns null when no modifier is held", () => {
    expect(toAccelerator(key({ key: "d" }))).toBeNull();
  });

  it("uppercases single-character keys", () => {
    expect(toAccelerator(key({ key: "q", metaKey: true }))).toBe("CmdOrCtrl+Q");
  });

  it("passes named keys through unchanged", () => {
    expect(toAccelerator(key({ key: "F5", metaKey: true }))).toBe("CmdOrCtrl+F5");
  });
});

describe("acceleratorToGlyphs", () => {
  it("translates the default CmdOrCtrl+Shift+D shortcut", () => {
    expect(acceleratorToGlyphs("CmdOrCtrl+Shift+D")).toEqual(["⌘", "⇧", "D"]);
  });

  it("translates Alt to its glyph", () => {
    expect(acceleratorToGlyphs("CmdOrCtrl+Alt+P")).toEqual(["⌘", "⌥", "P"]);
  });

  it("passes named keys through unchanged", () => {
    expect(acceleratorToGlyphs("CmdOrCtrl+F5")).toEqual(["⌘", "F5"]);
  });
});
