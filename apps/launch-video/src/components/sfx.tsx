import React from "react";
import { Audio, Sequence, staticFile } from "remotion";

/** One sound effect placed at an exact frame. */
export const Sfx: React.FC<{
  name: "click" | "tick" | "key" | "shutter" | "pop" | "whoosh";
  at: number;
  volume?: number;
}> = ({ name, at, volume = 1 }) => (
  <Sequence from={at} durationInFrames={40}>
    <Audio src={staticFile(`audio/sfx/${name}.wav`)} volume={volume} />
  </Sequence>
);

/** Quiet typing ticks between two frames, every `every` frames. */
export const TickTrack: React.FC<{
  from: number;
  to: number;
  every?: number;
  volume?: number;
}> = ({ from, to, every = 6, volume = 0.3 }) => (
  <>
    {Array.from({ length: Math.max(0, Math.floor((to - from) / every)) }, (_, i) => (
      <Sfx key={i} name="tick" at={from + i * every} volume={volume} />
    ))}
  </>
);
