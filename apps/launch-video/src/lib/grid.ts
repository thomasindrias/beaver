/** Tempo-grid math. All scene boundaries sit on bar lines so a 90 BPM
 * track can be dropped under any composition without re-timing scenes. */

export const beatLen = (bpm: number, fps: number): number => (60 / bpm) * fps;

export const barStart = (bar: number, bpm: number, fps: number): number =>
  Math.round(bar * 4 * beatLen(bpm, fps));

export const onBeat = (frame: number, bpm: number, fps: number): boolean =>
  frame % Math.round(beatLen(bpm, fps)) === 0;

export const BPM = 90;
export const FPS = 30;
/** Frames for n bars at the project tempo. */
export const bars = (n: number): number => barStart(n, BPM, FPS);
