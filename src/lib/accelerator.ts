export interface AcceleratorInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const BARE_MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);

/**
 * Translates a captured keydown into a Tauri accelerator string
 * ("CmdOrCtrl+Shift+D"). Requires at least one of Cmd/Ctrl held (Beaver's
 * global shortcut needs a primary modifier); a bare modifier keypress or a
 * plain letter with no modifier returns null so the caller can keep
 * listening instead of committing a half-formed combo.
 */
export function toAccelerator(e: AcceleratorInput): string | null {
  if (BARE_MODIFIER_KEYS.has(e.key)) return null;
  if (!e.metaKey && !e.ctrlKey) return null;

  const parts = ["CmdOrCtrl"];
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join("+");
}

const GLYPHS: Record<string, string> = {
  CmdOrCtrl: "⌘",
  Alt: "⌥",
  Shift: "⇧",
};

/**
 * Renders a Tauri accelerator string ("CmdOrCtrl+Shift+D") back into the
 * display glyphs the UI shows in <Kbd> elements. The inverse of
 * `toAccelerator`: modifiers map to their symbol, anything else (a literal
 * key like "D" or a named key like "F5") passes through unchanged.
 */
export function acceleratorToGlyphs(accelerator: string): string[] {
  return accelerator.split("+").map(token => GLYPHS[token] ?? token);
}
