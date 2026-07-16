import type { Rect } from "../components/CaptureOverlay";

export const HUD_GAP = 10;
export const HUD_HEIGHT = 34;
export const HUD_MAX_WIDTH = 240;
export const HUD_MARGIN = 8;

export interface HudAnchor {
  x: number;
  y: number;
  above: boolean;
}

// Anchor below the selection's bottom-left corner; flip above when the pill
// would overflow the bottom edge; clamp horizontally so the fully expanded
// pill (input open) never clips the viewport.
export function hudPosition(
  sel: Rect,
  viewport: { width: number; height: number }
): HudAnchor {
  const below = sel.y + sel.height + HUD_GAP;
  const above = below + HUD_HEIGHT > viewport.height;
  const x = Math.max(
    HUD_MARGIN,
    Math.min(sel.x, viewport.width - HUD_MARGIN - HUD_MAX_WIDTH)
  );
  return {
    x,
    y: above ? Math.max(HUD_MARGIN, sel.y - HUD_GAP - HUD_HEIGHT) : below,
    above,
  };
}
