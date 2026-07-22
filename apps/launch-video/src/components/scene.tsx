import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { dark } from "../theme";

/** Hold the render until webfonts are decoded so no frame ships with
 * fallback glyphs. */
const EnsureFonts: React.FC = () => {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => {
      if (alive) continueRender(handle);
    });
    return () => {
      alive = false;
    };
  }, [handle]);
  return null;
};

/** Dark scene shell: slate base, soft center light, vignetted edges. */
export const DarkScene: React.FC<{
  children: React.ReactNode;
  lift?: number;
}> = ({ children, lift = 1 }) => (
  <AbsoluteFill style={{ background: dark.bg }}>
    <EnsureFonts />
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 75% 60% at 50% 42%, ${dark.whiteDim(3 * lift)} 0%, transparent 70%)`,
      }}
    />
    {children}
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse 120% 100% at 50% 50%, transparent 60%, rgba(0,0,0,0.42) 100%)",
        pointerEvents: "none",
      }}
    />
  </AbsoluteFill>
);

export { EnsureFonts };
