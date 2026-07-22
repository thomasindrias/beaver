import React from "react";
import { Composition } from "remotion";
import "./style.css";
import { TwoWorlds, TWOWORLDS_DURATION } from "./scenes/twoworlds/TwoWorlds";
import { Reflex, REFLEX_DURATION } from "./scenes/reflex/Reflex";
import { Receipt, RECEIPT_DURATION } from "./scenes/receipt/Receipt";
import { LightsOut, LIGHTSOUT_DURATION } from "./scenes/lightsout/LightsOut";
import { RasterToVector, RASTER_DURATION } from "./scenes/raster/RasterToVector";
import { FPS } from "./lib/grid";

const size = { width: 1920, height: 1080 } as const;

export const Root: React.FC = () => (
  <>
    <Composition id="TwoWorlds" component={TwoWorlds} durationInFrames={TWOWORLDS_DURATION} fps={FPS} {...size} />
    <Composition id="Reflex" component={Reflex} durationInFrames={REFLEX_DURATION} fps={FPS} {...size} />
    <Composition id="Receipt" component={Receipt} durationInFrames={RECEIPT_DURATION} fps={FPS} {...size} />
    <Composition id="LightsOut" component={LightsOut} durationInFrames={LIGHTSOUT_DURATION} fps={FPS} {...size} />
    <Composition id="RasterToVector" component={RasterToVector} durationInFrames={RASTER_DURATION} fps={FPS} {...size} />
  </>
);
