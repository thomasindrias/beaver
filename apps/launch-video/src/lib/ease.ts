export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Linear 0..1 progress of `frame` through [from, to], clamped. */
export const progress = (frame: number, from: number, to: number): number =>
  to <= from ? (frame >= to ? 1 : 0) : clamp01((frame - from) / (to - from));

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

export const easeOutQuint = (t: number): number => 1 - (1 - t) ** 5;

export const easeOutExpo = (t: number): number =>
  t >= 1 ? 1 : 1 - 2 ** (-10 * t);

/** Gentle overshoot-and-settle, tuned below the springy default (s=1.2). */
export const easeOutBack = (t: number): number => {
  const s = 1.2;
  return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
};

/** Eased progress in one call: ep(frame, from, to, ease). */
export const ep = (
  frame: number,
  from: number,
  to: number,
  ease: (t: number) => number = easeInOutCubic,
): number => ease(progress(frame, from, to));
