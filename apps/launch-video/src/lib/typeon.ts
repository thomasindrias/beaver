/** How many characters of a string are visible at `frame`, typing at
 * `cps` characters/second from `startFrame`. */
export const charsAt = (
  frame: number,
  startFrame: number,
  cps: number,
  fps: number,
  total: number,
): number => {
  if (frame < startFrame) return 0;
  const shown = Math.floor(((frame - startFrame) / fps) * cps);
  return Math.min(total, Math.max(0, shown));
};
