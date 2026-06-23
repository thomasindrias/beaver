# Website Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `apps/website`, a single-screen landing page where the waving beaver video plays full-bleed, then settles into a centered hero with a headline, subhead, and one "Download for Mac" CTA pointing at GitHub Releases.

**Architecture:** A new Vite + React 19 + TypeScript workspace package (`@beaver/website`), mirroring `apps/desktop`'s tooling, reusing `@beaver/brand` and `@beaver/ui`. The wave video is transcoded once for the web and committed as a canonical brand asset, synced into the app's `public/` the same way `beaver-head.webp` already is.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS v4, Vitest + Testing Library, pnpm workspace + Turborepo (all already in the monorepo's catalog — no new dependencies).

**Spec:** `docs/superpowers/specs/2026-06-23-website-landing-page-design.md`

---

### Task 1: Scaffold the `apps/website` package

**Files:**
- Create: `apps/website/package.json`
- Create: `apps/website/tsconfig.json`
- Create: `apps/website/tsconfig.node.json`
- Create: `apps/website/vite.config.ts`
- Create: `apps/website/index.html`
- Create: `apps/website/src/main.tsx`
- Create: `apps/website/src/App.tsx`
- Create: `apps/website/src/index.css`
- Create: `apps/website/src/tests/setup.ts`

- [ ] **Step 1: Create the package manifest**

`apps/website/package.json`:

```json
{
  "name": "@beaver/website",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@beaver/brand": "workspace:*",
    "@beaver/ui": "workspace:*",
    "@fontsource-variable/geist": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "@tailwindcss/vite": "catalog:",
    "@testing-library/jest-dom": "catalog:",
    "@testing-library/react": "catalog:",
    "@testing-library/user-event": "catalog:",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "jsdom": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 2: Create the TypeScript configs**

`apps/website/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    "types": ["vitest/globals", "node"],

    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`apps/website/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "types": ["vitest/globals"]
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Create the Vite config**

`apps/website/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
  },
});
```

- [ ] **Step 4: Create the HTML entry point**

`apps/website/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beaver — Screenshot with purpose.</title>
    <meta
      name="description"
      content="Drag a box around anything on screen. Beaver turns it into clean Markdown, fully on-device."
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create the React entry point and a placeholder App**

`apps/website/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`apps/website/src/App.tsx`:

```tsx
export default function App() {
  return <div>Beaver</div>;
}
```

- [ ] **Step 6: Create global styles**

`apps/website/src/index.css`:

```css
@import "tailwindcss";
@import "@fontsource-variable/geist";

:root {
  --color-page-background: #eff0f6;
  --color-ink: #211c16;
  --color-ink-muted: #6b635a;
  --color-accent: #dd6b27;
  --color-accent-hover: #c85a1c;
}

@theme inline {
  --font-sans: "Geist Variable", ui-sans-serif, -apple-system,
    BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
}

@layer base {
  html,
  body,
  #root {
    height: 100%;
  }
  body {
    margin: 0;
    background: var(--color-page-background);
    color: var(--color-ink);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
}

@keyframes beaver-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-rise {
  animation: beaver-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
```

- [ ] **Step 7: Create the test setup file**

`apps/website/src/tests/setup.ts`:

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 8: Install and verify the skeleton**

Run: `pnpm install`
Expected: lockfile updates, `@beaver/website` resolves with no errors.

Run: `pnpm --filter @beaver/website typecheck`
Expected: exits 0, no output (no errors).

Run: `pnpm --filter @beaver/website build`
Expected: ends with `✓ built in ...`.

- [ ] **Step 9: Commit**

```bash
git add apps/website pnpm-lock.yaml
git commit -m "feat: scaffold @beaver/website package"
```

---

### Task 2: Add the wave video as a canonical brand asset

**Files:**
- Modify: `tests/brand-assets.test.ts`
- Create: `packages/brand/assets/beaver-wave.mp4`
- Modify: `scripts/sync-brand-assets.mjs`

- [ ] **Step 1: Write the failing asset-sync test**

Add to `tests/brand-assets.test.ts`, inside the existing `describe("brand asset sync", ...)` block, as a new test alongside the existing `it("keeps desktop public copies in sync...")`:

```ts
  it("keeps website public copies in sync with canonical brand assets", () => {
    sameBytes(
      "packages/brand/assets/beaver-wave.mp4",
      "apps/website/public/beaver-wave.mp4",
    );
    sameBytes(
      "packages/brand/assets/favicon.ico",
      "apps/website/public/favicon.ico",
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/brand-assets.test.ts`
Expected: FAIL — `packages/brand/assets/beaver-wave.mp4` does not exist (ENOENT).

- [ ] **Step 3: Transcode the source video for the web**

The source file in `~/Downloads` is a Topaz-upscaled master (2224×1668, ~18MB, HEVC) — far too heavy to ship on a landing page. Transcode it to a compact, broadly-compatible H.264 MP4:

Run:

```bash
ffmpeg -y -i "/Users/thomasindrias/Downloads/beaver_Topaz Video Upscaler_2026-06-05_09-29-21.mp4" \
  -vf "scale=1600:-2" \
  -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p \
  -movflags +faststart -an \
  packages/brand/assets/beaver-wave.mp4
```

Expected: a new file at `packages/brand/assets/beaver-wave.mp4`, roughly 700KB-1MB (down from ~18MB) — confirm with `ls -la packages/brand/assets/beaver-wave.mp4`.

- [ ] **Step 4: Add sync targets for the website app**

Modify `scripts/sync-brand-assets.mjs` — extend the `assets` array (currently `beaver-head.webp` and `favicon.ico`, each only targeting the desktop app) so both existing assets also sync to the website, and add the new video:

```js
const assets = [
  {
    name: "beaver-head.webp",
    source: "packages/brand/assets/beaver-head.webp",
    targets: ["apps/desktop/public/beaver-head.webp"],
  },
  {
    name: "favicon.ico",
    source: "packages/brand/assets/favicon.ico",
    targets: [
      "apps/desktop/public/favicon.ico",
      "apps/website/public/favicon.ico",
    ],
  },
  {
    name: "beaver-wave.mp4",
    source: "packages/brand/assets/beaver-wave.mp4",
    targets: ["apps/website/public/beaver-wave.mp4"],
  },
];
```

- [ ] **Step 5: Run the sync script**

Run: `pnpm sync:assets`
Expected: no output on success; `apps/website/public/beaver-wave.mp4` and `apps/website/public/favicon.ico` now exist.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run tests/brand-assets.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Commit**

```bash
git add tests/brand-assets.test.ts packages/brand/assets/beaver-wave.mp4 \
  scripts/sync-brand-assets.mjs apps/website/public/beaver-wave.mp4 \
  apps/website/public/favicon.ico
git commit -m "feat: add beaver-wave video as a synced brand asset"
```

---

### Task 3: `usePrefersReducedMotion` hook

**Files:**
- Create: `apps/website/src/hooks/usePrefersReducedMotion.ts`
- Test: `apps/website/src/tests/usePrefersReducedMotion.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/website/src/tests/usePrefersReducedMotion.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (
      _: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.delete(listener);
    },
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return {
    emit(next: boolean) {
      mql.matches = next;
      listeners.forEach((listener) =>
        listener({ matches: next } as MediaQueryListEvent),
      );
    },
  };
}

describe("usePrefersReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when the media query does not match", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("returns true when the media query matches", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("updates when the media query changes", () => {
    const { emit } = mockMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => emit(true));
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beaver/website exec vitest run src/tests/usePrefersReducedMotion.test.ts`
Expected: FAIL — cannot find module `../hooks/usePrefersReducedMotion`.

- [ ] **Step 3: Implement the hook**

`apps/website/src/hooks/usePrefersReducedMotion.ts`:

```ts
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(
    () => window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(QUERY);
    const listener = (event: MediaQueryListEvent) =>
      setPrefersReduced(event.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  return prefersReduced;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beaver/website exec vitest run src/tests/usePrefersReducedMotion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/website/src/hooks apps/website/src/tests/usePrefersReducedMotion.test.ts
git commit -m "feat: add usePrefersReducedMotion hook"
```

---

### Task 4: `SettledHero` component (content layer)

**Files:**
- Create: `apps/website/src/constants.ts`
- Create: `apps/website/src/components/SettledHero.tsx`
- Test: `apps/website/src/tests/SettledHero.test.tsx`

- [ ] **Step 1: Create the copy/constants module**

`apps/website/src/constants.ts`:

```ts
export const RELEASES_URL =
  "https://github.com/thomasindrias/beaver/releases/latest";

export const heroCopy = {
  headline: "Screenshot with purpose.",
  subhead:
    "Drag a box around anything on screen. Tables stay tables, code stays code — and it never leaves your Mac.",
  cta: "Download for Mac",
  qualifier: "Apple Silicon only · macOS 13+",
} as const;
```

- [ ] **Step 2: Write the failing test**

`apps/website/src/tests/SettledHero.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettledHero } from "../components/SettledHero";
import { heroCopy, RELEASES_URL } from "../constants";

describe("SettledHero", () => {
  it("renders the headline and subhead", () => {
    render(<SettledHero autoPlayVideo />);
    expect(screen.getByText(heroCopy.headline)).toBeInTheDocument();
    expect(screen.getByText(heroCopy.subhead)).toBeInTheDocument();
  });

  it("renders the qualifier line", () => {
    render(<SettledHero autoPlayVideo />);
    expect(screen.getByText(heroCopy.qualifier)).toBeInTheDocument();
  });

  it("renders the CTA as a safe external link to GitHub Releases", () => {
    render(<SettledHero autoPlayVideo />);
    const cta = screen.getByRole("link", { name: heroCopy.cta });
    expect(cta).toHaveAttribute("href", RELEASES_URL);
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("marks the looping video as decorative", () => {
    render(<SettledHero autoPlayVideo />);
    const video = document.querySelector("video");
    expect(video).toHaveAttribute("aria-hidden", "true");
  });

  it("does not autoplay the video when autoPlayVideo is false", () => {
    render(<SettledHero autoPlayVideo={false} />);
    const video = document.querySelector("video");
    expect(video).not.toHaveAttribute("autoplay");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @beaver/website exec vitest run src/tests/SettledHero.test.tsx`
Expected: FAIL — cannot find module `../components/SettledHero`.

- [ ] **Step 4: Implement the component**

`apps/website/src/components/SettledHero.tsx`:

```tsx
import { brandAssets } from "@beaver/brand";
import { heroCopy, RELEASES_URL } from "../constants";

interface SettledHeroProps {
  autoPlayVideo: boolean;
}

export function SettledHero({ autoPlayVideo }: SettledHeroProps) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 text-center">
      <video
        className="h-auto w-64 [-webkit-mask-image:radial-gradient(closest-side,black_75%,transparent_100%)] [mask-image:radial-gradient(closest-side,black_75%,transparent_100%)] sm:w-80"
        src={brandAssets.wave}
        autoPlay={autoPlayVideo}
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        {heroCopy.headline}
      </h1>
      <p className="max-w-md text-base text-[var(--color-ink-muted)] sm:text-lg">
        {heroCopy.subhead}
      </p>
      <a
        href={RELEASES_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-[var(--color-accent)] px-8 py-3 text-base font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
      >
        {heroCopy.cta}
      </a>
      <p className="text-sm text-[var(--color-ink-muted)]">
        {heroCopy.qualifier}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @beaver/website exec vitest run src/tests/SettledHero.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/website/src/constants.ts apps/website/src/components/SettledHero.tsx \
  apps/website/src/tests/SettledHero.test.tsx
git commit -m "feat: add SettledHero content layer"
```

---

### Task 5: `IntroVideo` component (full-bleed intro mechanics)

**Files:**
- Create: `apps/website/src/components/IntroVideo.tsx`
- Test: `apps/website/src/tests/IntroVideo.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/website/src/tests/IntroVideo.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IntroVideo } from "../components/IntroVideo";

describe("IntroVideo", () => {
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
  });

  it("plays the video on mount", () => {
    render(<IntroVideo isSettled={false} onSettle={vi.fn()} />);
    expect(playSpy).toHaveBeenCalled();
  });

  it("calls onSettle when the video ends", () => {
    const onSettle = vi.fn();
    render(<IntroVideo isSettled={false} onSettle={onSettle} />);
    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent.ended(video);
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it("calls onSettle when clicked (skip)", () => {
    const onSettle = vi.fn();
    render(<IntroVideo isSettled={false} onSettle={onSettle} />);
    fireEvent.click(screen.getByTestId("intro-video"));
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it("calls onSettle when autoplay is blocked", async () => {
    playSpy.mockRejectedValueOnce(new Error("NotAllowedError"));
    const onSettle = vi.fn();
    render(<IntroVideo isSettled={false} onSettle={onSettle} />);
    await waitFor(() => expect(onSettle).toHaveBeenCalledTimes(1));
  });

  it("pauses the video once settled", () => {
    const pauseSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});
    const { rerender } = render(
      <IntroVideo isSettled={false} onSettle={vi.fn()} />,
    );
    rerender(<IntroVideo isSettled={true} onSettle={vi.fn()} />);
    expect(pauseSpy).toHaveBeenCalled();
    pauseSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beaver/website exec vitest run src/tests/IntroVideo.test.tsx`
Expected: FAIL — cannot find module `../components/IntroVideo`.

- [ ] **Step 3: Implement the component**

`apps/website/src/components/IntroVideo.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { brandAssets } from "@beaver/brand";

interface IntroVideoProps {
  isSettled: boolean;
  onSettle: () => void;
}

export function IntroVideo({ isSettled, onSettle }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    videoRef.current?.play().catch(onSettle);
  }, [onSettle]);

  useEffect(() => {
    if (isSettled) {
      videoRef.current?.pause();
    }
  }, [isSettled]);

  return (
    <div
      data-testid="intro-video"
      aria-hidden="true"
      onClick={onSettle}
      className={`fixed inset-0 z-0 flex cursor-pointer items-center justify-center bg-[var(--color-page-background)] transition-opacity duration-500 ${
        isSettled ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={brandAssets.wave}
        muted
        playsInline
        onEnded={onSettle}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @beaver/website exec vitest run src/tests/IntroVideo.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/website/src/components/IntroVideo.tsx apps/website/src/tests/IntroVideo.test.tsx
git commit -m "feat: add IntroVideo full-bleed intro component"
```

---

### Task 6: `Hero` composition + wire up `App`

**Files:**
- Create: `apps/website/src/components/Hero.tsx`
- Modify: `apps/website/src/App.tsx`
- Test: `apps/website/src/tests/Hero.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/website/src/tests/Hero.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Hero } from "../components/Hero";
import { heroCopy } from "../constants";

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe("Hero", () => {
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("starts in the intro phase and does not show the headline yet", () => {
    stubMatchMedia(false);
    render(<Hero />);
    expect(screen.queryByText(heroCopy.headline)).not.toBeInTheDocument();
  });

  it("settles and shows the headline once the intro video ends", () => {
    stubMatchMedia(false);
    render(<Hero />);
    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent.ended(video);
    expect(screen.getByText(heroCopy.headline)).toBeInTheDocument();
  });

  it("settles immediately when the visitor prefers reduced motion, without autoplaying", () => {
    stubMatchMedia(true);
    render(<Hero />);
    expect(screen.getByText(heroCopy.headline)).toBeInTheDocument();
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).not.toHaveAttribute("autoplay");
  });

  it("settles when autoplay is blocked", async () => {
    stubMatchMedia(false);
    playSpy.mockRejectedValueOnce(new Error("NotAllowedError"));
    render(<Hero />);
    await waitFor(() =>
      expect(screen.getByText(heroCopy.headline)).toBeInTheDocument(),
    );
  });

  it("settles when the intro is clicked (skip)", () => {
    stubMatchMedia(false);
    render(<Hero />);
    fireEvent.click(screen.getByTestId("intro-video"));
    expect(screen.getByText(heroCopy.headline)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @beaver/website exec vitest run src/tests/Hero.test.tsx`
Expected: FAIL — cannot find module `../components/Hero`.

- [ ] **Step 3: Implement the component**

`apps/website/src/components/Hero.tsx`:

```tsx
import { useCallback, useState } from "react";
import { BrandMark } from "@beaver/ui";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { IntroVideo } from "./IntroVideo";
import { SettledHero } from "./SettledHero";

type Phase = "intro" | "settled";

export function Hero() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(
    prefersReducedMotion ? "settled" : "intro",
  );
  // Stable reference: IntroVideo's mount effect depends on this, and we
  // don't want it re-firing play() on the settle re-render.
  const settle = useCallback(() => setPhase("settled"), []);

  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[var(--color-page-background)]">
      <BrandMark size={32} decorative className="absolute left-6 top-6 z-10" />
      {!prefersReducedMotion && (
        <IntroVideo isSettled={phase === "settled"} onSettle={settle} />
      )}
      {phase === "settled" && (
        <div className="animate-rise">
          <SettledHero autoPlayVideo={!prefersReducedMotion} />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Wire it into `App`**

Replace `apps/website/src/App.tsx`:

```tsx
import { Hero } from "./components/Hero";

export default function App() {
  return <Hero />;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @beaver/website exec vitest run src/tests/Hero.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the full website test suite**

Run: `pnpm --filter @beaver/website test:run`
Expected: all test files pass (Hero, IntroVideo, SettledHero, usePrefersReducedMotion).

- [ ] **Step 7: Commit**

```bash
git add apps/website/src/components/Hero.tsx apps/website/src/App.tsx \
  apps/website/src/tests/Hero.test.tsx
git commit -m "feat: compose Hero phase machine and wire up App"
```

---

### Task 7: Manual visual QA

No code changes are expected here unless something looks wrong — this is a deliberate look-at-it-in-a-browser checkpoint before moving on, since none of the prior tests assert visual correctness.

- [ ] **Step 1: Start the dev server**

Run: `pnpm --filter @beaver/website dev`
Expected: prints a local URL (e.g. `http://localhost:5173/`).

- [ ] **Step 2: Check the desktop experience**

Open the URL in a browser. Confirm:
- The beaver plays full-bleed immediately with no visible seam against the page background.
- After the clip ends (~5s), it settles into the centered headline/subhead/CTA layout without a jarring pop.
- Clicking during the intro skips straight to the settled layout.
- The CTA opens `https://github.com/thomasindrias/beaver/releases/latest` in a new tab.

- [ ] **Step 3: Check reduced motion**

In Chrome DevTools: Cmd+Shift+P → "Show Rendering" → set "Emulate CSS media feature prefers-reduced-motion" to `reduce`. Reload. Confirm the page loads directly into the settled layout with no intro flash, and the small video is static (not playing) until interacted with.

- [ ] **Step 4: Check mobile widths**

Resize the viewport (or use device emulation) down to ~375px wide. Confirm the headline/subhead wrap cleanly, the CTA stays tappable, and the full-bleed intro still covers the viewport with no letterboxing gaps.

- [ ] **Step 5: Stop the dev server, and if anything looked off, fix it directly in `Hero.tsx`, `IntroVideo.tsx`, `SettledHero.tsx`, or `index.css`, then re-run Step 1-4. If a fix was made, commit it:**

```bash
git add apps/website/src
git commit -m "fix: visual QA adjustments to landing page"
```

(Skip the commit if no changes were needed.)

---

### Task 8: Update the stale workspace contract test

**Files:**
- Modify: `tests/workspace-config.test.ts:9-12`

- [ ] **Step 1: Update the assertion**

The test currently asserts the website app does *not* exist yet (a deliberate fence from the prior monorepo-refactor pass). Replace it now that the app is real:

```ts
  it("has both a desktop app and a website app", () => {
    expect(existsSync("apps/desktop/package.json")).toBe(true);
    expect(existsSync("apps/website/package.json")).toBe(true);
  });
```

This replaces the existing `it("has a desktop app and no website app in this pass", ...)` block (lines 9-12 of `tests/workspace-config.test.ts`).

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm vitest run tests/workspace-config.test.ts`
Expected: PASS (all 4 tests in the file).

- [ ] **Step 3: Commit**

```bash
git add tests/workspace-config.test.ts
git commit -m "test: confirm website app now exists in workspace contract"
```

---

### Task 9: Full workspace verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck everything**

Run: `pnpm typecheck`
Expected: all packages (`@beaver/brand`, `@beaver/ui`, `@beaver/desktop`, `@beaver/website`) pass with no errors.

- [ ] **Step 2: Run every test**

Run: `pnpm test:run`
Expected: all test files across the workspace pass, including the two root contract test files and every `apps/website` test file.

- [ ] **Step 3: Build everything**

Run: `pnpm build`
Expected: ends with all packages built successfully, including `apps/website/dist`.

- [ ] **Step 4: Confirm nothing is left uncommitted**

Run: `git status`
Expected: clean working tree.

---

## Deployment (manual follow-up, not part of this plan)

Once this plan is merged, deploying is a Vercel dashboard/CLI action outside the scope of automated, testable steps:

- Create a Vercel project pointed at this repo.
- Set **Root Directory** to `apps/website`, **Framework Preset** to Vite.
- Leave install/build commands on Vercel's pnpm-workspace defaults (it detects the root lockfile automatically).
- No custom domain yet — the `*.vercel.app` URL is fine for this pass.
- The CTA already points at GitHub Releases, so publishing a signed DMG via `pnpm release:mac` is the only other step needed to make the download link real — no website change required.
