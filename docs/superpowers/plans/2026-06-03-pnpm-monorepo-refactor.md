# Beaver Desktop pnpm Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Beaver into a pnpm/Turborepo monorepo for the existing desktop app, with focused shared brand/UI packages and no website app.

**Architecture:** Move the Vite/Tauri app to `apps/desktop`, keep root-owned workspace orchestration, and add `@beaver/brand` plus `@beaver/ui` as small reusable packages. Root `pnpm dev` targets all packages under `apps/*`, so a future mocked website can join by adding an app package with a `dev` script.

**Tech Stack:** pnpm 10.33.0, Turborepo 2.9.16, React 19, TypeScript 5.8, Vite 7, Tauri 2, Vitest 4.

---

## Guardrails

- Per `AGENTS.md`, run shell commands with the `rtk` prefix.
- Do not create `apps/website`.
- The old untracked `website/` directory was intentionally removed from scope.
- Keep the desktop app visually and behaviorally unchanged.
- Keep real `.env.release` credentials untracked and do not move or print them.
- Commit after each task when verification passes.

## Target File Map

| Path | Action | Responsibility |
| --- | --- | --- |
| `package.json` | Replace | Root workspace scripts and dev tooling |
| `pnpm-workspace.yaml` | Create | pnpm packages and shared dependency catalog |
| `turbo.json` | Create | Workspace task orchestration |
| `tests/workspace-config.test.ts` | Create | Root workspace contract tests |
| `tests/brand-assets.test.ts` | Create | Canonical asset drift tests |
| `apps/desktop/` | Create by move | Existing Vite/Tauri desktop app |
| `apps/desktop/package.json` | Create | Desktop package manifest |
| `apps/desktop/src/tests/release-script.test.ts` | Modify | Root release script tests after move |
| `scripts/release-macos.sh` | Modify | Root release script with desktop paths |
| `scripts/gen-dmg-background.py` | Modify | Desktop asset paths after move |
| `scripts/dmgbuild-settings.py` | Keep | DMG layout settings |
| `packages/brand/` | Create | Framework-neutral product data and brand assets |
| `packages/ui/` | Create | `cn` and `BrandMark` shared React utilities |
| `README.md` | Modify | Monorepo command and layout docs |

---

### Task 1: Move Desktop Into Workspace

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tests/workspace-config.test.ts`
- Create: `apps/desktop/package.json`
- Move: `src/` -> `apps/desktop/src/`
- Move: `src-tauri/` -> `apps/desktop/src-tauri/`
- Move: `public/` -> `apps/desktop/public/`
- Move: `index.html` -> `apps/desktop/index.html`
- Move: `components.json` -> `apps/desktop/components.json`
- Move: `vite.config.ts` -> `apps/desktop/vite.config.ts`
- Move: `tsconfig.json` -> `apps/desktop/tsconfig.json`
- Move: `tsconfig.node.json` -> `apps/desktop/tsconfig.node.json`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `scripts/release-macos.sh`
- Modify: `scripts/gen-dmg-background.py`
- Modify: `apps/desktop/src/tests/release-script.test.ts`

- [ ] **Step 1: Write the failing workspace config test**

Create `tests/workspace-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("workspace layout", () => {
  it("has a desktop app and no website app in this pass", () => {
    expect(existsSync("apps/desktop/package.json")).toBe(true);
    expect(existsSync("apps/website/package.json")).toBe(false);
  });

  it("keeps root dev on the apps/* pattern", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts.dev).toContain("turbo run dev");
    expect(pkg.scripts.dev).toContain("./apps/*");
  });

  it("keeps native Tauri dev explicit", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts.tauri).toContain("@beaver/desktop");
    expect(pkg.scripts["tauri:onboarding"]).toContain("BEAVER_FORCE_ONBOARDING=1");
  });

  it("registers only apps and packages as workspaces", () => {
    const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
    expect(workspace).toContain("apps/*");
    expect(workspace).toContain("packages/*");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm exec vitest run tests/workspace-config.test.ts
```

Expected: fails because `apps/desktop/package.json` and workspace files do not
exist yet.

- [ ] **Step 3: Move the desktop files**

Run:

```bash
rtk mkdir -p apps/desktop
rtk git mv src apps/desktop/src
rtk git mv src-tauri apps/desktop/src-tauri
rtk git mv public apps/desktop/public
rtk git mv index.html apps/desktop/index.html
rtk git mv components.json apps/desktop/components.json
rtk git mv vite.config.ts apps/desktop/vite.config.ts
rtk git mv tsconfig.json apps/desktop/tsconfig.json
rtk git mv tsconfig.node.json apps/desktop/tsconfig.node.json
```

Expected: `apps/desktop` contains the current desktop app source. Root
`scripts/`, `.env.release.example`, `.gitignore`, `README.md`, and docs remain
at the root.

- [ ] **Step 4: Replace the root package manifest**

Replace `package.json` with:

```json
{
  "name": "beaver-workspace",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "pnpm sync:assets && turbo run dev --filter='./apps/*' --parallel",
    "build": "pnpm sync:assets && turbo run build --filter='./packages/*' --filter='./apps/*'",
    "preview": "pnpm sync:assets && pnpm --filter @beaver/desktop run preview",
    "test": "vitest --passWithNoTests && turbo run test --filter='./packages/*' --filter='./apps/*'",
    "test:run": "vitest run tests --passWithNoTests && turbo run test:run --filter='./packages/*' --filter='./apps/*'",
    "typecheck": "turbo run typecheck --filter='./packages/*' --filter='./apps/*'",
    "sync:assets": "node scripts/sync-brand-assets.mjs",
    "desktop:dev": "pnpm sync:assets && pnpm --filter @beaver/desktop run dev",
    "desktop:build": "pnpm sync:assets && pnpm --filter @beaver/desktop run build",
    "desktop:test": "pnpm --filter @beaver/desktop run test:run",
    "desktop:typecheck": "pnpm --filter @beaver/desktop run typecheck",
    "tauri": "pnpm sync:assets && pnpm --filter @beaver/desktop exec tauri --",
    "tauri:onboarding": "pnpm sync:assets && BEAVER_FORCE_ONBOARDING=1 pnpm --filter @beaver/desktop exec tauri dev",
    "release:mac": "pnpm sync:assets && bash scripts/release-macos.sh"
  },
  "devDependencies": {
    "turbo": "2.9.16",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 5: Create the workspace manifest**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"

catalog:
  "@base-ui/react": "^1.5.0"
  "@fontsource-variable/geist": "^5.2.9"
  "@tailwindcss/vite": "^4.3.0"
  "@tauri-apps/api": "^2.11.0"
  "@tauri-apps/cli": "^2.11.2"
  "@tauri-apps/plugin-sql": "^2.4.0"
  "@testing-library/jest-dom": "^6.9.1"
  "@testing-library/react": "^16.3.2"
  "@testing-library/user-event": "^14.6.1"
  "@types/node": "^25.9.1"
  "@types/react": "^19.2.15"
  "@types/react-dom": "^19.2.3"
  "@vitejs/plugin-react": "^4.7.0"
  "@vitest/ui": "^4.1.7"
  "class-variance-authority": "^0.7.1"
  "clsx": "^2.1.1"
  "jsdom": "^29.1.1"
  "lucide-react": "^1.17.0"
  "react": "^19.2.6"
  "react-dom": "^19.2.6"
  "shadcn": "^4.9.0"
  "tailwind-merge": "^3.6.0"
  "tailwindcss": "^4.3.0"
  "tw-animate-css": "^1.4.0"
  "typescript": "~5.8.3"
  "vite": "^7.3.3"
  "vitest": "^4.1.7"
```

- [ ] **Step 6: Create the Turbo config**

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "test:run": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    }
  }
}
```

- [ ] **Step 7: Ignore Turbo's local cache**

Append this line to `.gitignore`:

```gitignore
.turbo/
```

- [ ] **Step 8: Create the desktop package manifest**

Create `apps/desktop/package.json`:

```json
{
  "name": "@beaver/desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest",
    "test:run": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@base-ui/react": "catalog:",
    "@fontsource-variable/geist": "catalog:",
    "@tauri-apps/api": "catalog:",
    "@tauri-apps/plugin-sql": "catalog:",
    "class-variance-authority": "catalog:",
    "clsx": "catalog:",
    "lucide-react": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "shadcn": "catalog:",
    "tailwind-merge": "catalog:",
    "tw-animate-css": "catalog:"
  },
  "devDependencies": {
    "@tailwindcss/vite": "catalog:",
    "@tauri-apps/cli": "catalog:",
    "@testing-library/jest-dom": "catalog:",
    "@testing-library/react": "catalog:",
    "@testing-library/user-event": "catalog:",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "@vitest/ui": "catalog:",
    "jsdom": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:"
  }
}
```

This keeps `clsx` and `tailwind-merge` on the desktop app temporarily because
`apps/desktop/src/lib/utils.ts` still owns `cn` until Task 3.

- [ ] **Step 9: Update release tests for root paths and deterministic env**

Replace `apps/desktop/src/tests/release-script.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function rootPath(path: string): string {
  return join(workspaceRoot, path);
}

function printMode(identity: string): string {
  return execFileSync("bash", [rootPath("scripts/release-macos.sh"), "--print-mode"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      BEAVER_RELEASE_ENV_FILE: "/dev/null",
      APPLE_SIGNING_IDENTITY: identity,
    },
  }).trim();
}

describe("release-macos.sh", () => {
  it("reports unsigned without a signing identity", () => {
    expect(printMode("")).toBe("unsigned");
  });

  it("reports signed when a signing identity is set", () => {
    expect(printMode("Developer ID Application: DJTL AB (Z7HLVJ93DA)")).toBe("signed");
  });
});

describe("release wiring", () => {
  it("documents credentials in .env.release.example", () => {
    const ex = readFileSync(rootPath(".env.release.example"), "utf8");
    expect(ex).toContain("APPLE_SIGNING_IDENTITY");
    expect(ex).toContain("APPLE_TEAM_ID");
  });

  it("gitignores the real .env.release", () => {
    expect(readFileSync(rootPath(".gitignore"), "utf8")).toContain(".env.release");
  });

  it("exposes a release:mac script at the workspace root", () => {
    const pkg = JSON.parse(readFileSync(rootPath("package.json"), "utf8"));
    expect(pkg.scripts["release:mac"]).toContain("release-macos.sh");
  });

  it("keeps the example file at the workspace root", () => {
    expect(existsSync(rootPath(".env.release.example"))).toBe(true);
  });
});

describe("headless dmg packaging", () => {
  it("packages the DMG with dmgbuild (no Finder/AppleScript)", () => {
    const sh = readFileSync(rootPath("scripts/release-macos.sh"), "utf8");
    expect(sh).toContain("dmgbuild");
    expect(sh).toContain("scripts/dmgbuild-settings.py");
  });

  it("ships a dmgbuild settings file with the install layout", () => {
    const s = readFileSync(rootPath("scripts/dmgbuild-settings.py"), "utf8");
    expect(s).toContain("symlinks");
    expect(s).toContain("Applications");
    expect(s).toContain("icon_locations");
    expect(s).toContain("BEAVER_APP");
  });
});
```

- [ ] **Step 10: Update `scripts/release-macos.sh` paths**

Edit the top of `scripts/release-macos.sh` so root and desktop paths are
explicit:

```bash
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$WORKSPACE_ROOT/apps/desktop"
cd "$WORKSPACE_ROOT"

load_release_env() {
  if [[ -n "${BEAVER_RELEASE_ENV_FILE:-}" ]]; then
    if [[ -f "$BEAVER_RELEASE_ENV_FILE" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$BEAVER_RELEASE_ENV_FILE"
      set +a
    fi
    return
  fi

  local candidate
  for candidate in "$WORKSPACE_ROOT/.env.release" "$DESKTOP_DIR/.env.release"; do
    if [[ -f "$candidate" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$candidate"
      set +a
      return
    fi
  done
}

load_release_env
```

Then update path-sensitive lines:

```bash
pnpm --filter @beaver/desktop exec tauri build --target "$TARGET"

BUNDLE="$DESKTOP_DIR/src-tauri/target/${TARGET}/release/bundle"

codesign --force --options runtime --timestamp \
  --entitlements "$DESKTOP_DIR/src-tauri/entitlements.plist" \
  --sign "$APPLE_SIGNING_IDENTITY" "$APP"

VERSION="$(node -p "require('./apps/desktop/package.json').version")"

tiffutil -cathidpicheck \
  "$DESKTOP_DIR/src-tauri/dmg/background.png" \
  "$DESKTOP_DIR/src-tauri/dmg/background@2x.png" \
  -out "$BG_TIFF" >/dev/null

BEAVER_APP="$APP" \
BEAVER_DMG_BG="$BG_TIFF" \
BEAVER_VOLICON="$DESKTOP_DIR/src-tauri/icons/icon.icns" \
  uv run --no-project --with dmgbuild -- \
    dmgbuild -s scripts/dmgbuild-settings.py "Beaver" "$DMG"
```

- [ ] **Step 11: Update the DMG background generator**

Replace `scripts/gen-dmg-background.py` path constants with:

```py
ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "apps" / "desktop"
OUT = DESKTOP / "src-tauri" / "dmg"
HEAD = DESKTOP / "public" / "beaver-head.webp"
```

- [ ] **Step 12: Install and verify Task 1**

Run:

```bash
rtk pnpm install
rtk pnpm exec vitest run tests/workspace-config.test.ts
rtk pnpm --filter @beaver/desktop test:run
```

Expected: workspace and desktop tests pass from the moved package location.

- [ ] **Step 13: Commit Task 1**

Run:

```bash
rtk git add package.json .gitignore pnpm-workspace.yaml turbo.json pnpm-lock.yaml tests/workspace-config.test.ts apps/desktop scripts
rtk git commit -m "refactor: move desktop app into pnpm workspace"
```

---

### Task 2: Add Brand Package And Asset Sync

**Files:**
- Create: `packages/brand/package.json`
- Create: `packages/brand/tsconfig.json`
- Create: `packages/brand/src/index.ts`
- Create: `packages/brand/src/index.test.ts`
- Create by copy: `packages/brand/assets/beaver-head.webp`
- Create by copy: `packages/brand/assets/favicon.ico`
- Create: `scripts/sync-brand-assets.mjs`
- Create: `tests/brand-assets.test.ts`
- Modify: `apps/desktop/index.html`

- [ ] **Step 1: Create the brand package manifest**

Create `packages/brand/package.json`:

```json
{
  "name": "@beaver/brand",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Create `packages/brand/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Add brand exports and tests**

Create `packages/brand/src/index.ts`:

```ts
export const beaverProduct = {
  name: "Beaver",
  tagline: "Screenshot to structured Markdown, fully on-device.",
  platform: "macOS",
} as const;

export const brandAssets = {
  head: "/beaver-head.webp",
  favicon: "/favicon.ico",
} as const;

export type BrandAssetName = keyof typeof brandAssets;
```

Create `packages/brand/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { beaverProduct, brandAssets } from ".";

describe("@beaver/brand", () => {
  it("exports stable product metadata", () => {
    expect(beaverProduct.name).toBe("Beaver");
    expect(beaverProduct.platform).toBe("macOS");
  });

  it("exports public asset paths", () => {
    expect(brandAssets.head).toBe("/beaver-head.webp");
    expect(brandAssets.favicon).toBe("/favicon.ico");
  });
});
```

- [ ] **Step 3: Copy canonical assets**

Run:

```bash
rtk mkdir -p packages/brand/assets
rtk cp apps/desktop/public/beaver-head.webp packages/brand/assets/beaver-head.webp
rtk cp apps/desktop/src-tauri/icons/icon.ico packages/brand/assets/favicon.ico
```

- [ ] **Step 4: Add the asset sync script**

Create `scripts/sync-brand-assets.mjs`:

```js
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const assets = [
  {
    name: "beaver-head.webp",
    source: "packages/brand/assets/beaver-head.webp",
    targets: ["apps/desktop/public/beaver-head.webp"],
  },
  {
    name: "favicon.ico",
    source: "packages/brand/assets/favicon.ico",
    targets: ["apps/desktop/public/favicon.ico"],
  },
];

const check = process.argv.includes("--check");
let drifted = false;

for (const asset of assets) {
  const sourcePath = join(workspaceRoot, asset.source);
  const source = readFileSync(sourcePath);

  for (const target of asset.targets) {
    const targetPath = join(workspaceRoot, target);

    if (check) {
      let current;
      try {
        current = readFileSync(targetPath);
      } catch {
        console.error(`missing synced asset: ${target}`);
        drifted = true;
        continue;
      }

      if (!source.equals(current)) {
        console.error(`asset drift: ${asset.source} != ${target}`);
        drifted = true;
      }
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, source);
  }
}

if (drifted) {
  process.exitCode = 1;
}
```

- [ ] **Step 5: Add workspace asset drift tests**

Create `tests/brand-assets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

function sameBytes(left: string, right: string) {
  expect(readFileSync(left), `${left} should match ${right}`).toEqual(readFileSync(right));
}

describe("brand asset sync", () => {
  it("keeps desktop public copies in sync with canonical brand assets", () => {
    sameBytes("packages/brand/assets/beaver-head.webp", "apps/desktop/public/beaver-head.webp");
    sameBytes("packages/brand/assets/favicon.ico", "apps/desktop/public/favicon.ico");
  });

  it("removes starter template assets from the desktop app", () => {
    expect(existsSync("apps/desktop/public/vite.svg")).toBe(false);
    expect(existsSync("apps/desktop/public/tauri.svg")).toBe(false);
    expect(existsSync("apps/desktop/src/assets/react.svg")).toBe(false);
  });
});
```

- [ ] **Step 6: Update desktop HTML**

Replace the `<head>` in `apps/desktop/index.html` with:

```html
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beaver</title>
  </head>
```

Then remove starter assets:

```bash
rtk git rm apps/desktop/public/vite.svg apps/desktop/public/tauri.svg apps/desktop/src/assets/react.svg
rtk pnpm sync:assets
```

- [ ] **Step 7: Verify Task 2**

Run:

```bash
rtk pnpm install
rtk pnpm --filter @beaver/brand test:run
rtk pnpm sync:assets --check
rtk pnpm exec vitest run tests/brand-assets.test.ts
```

Expected: all commands pass.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
rtk git add package.json pnpm-lock.yaml packages/brand scripts/sync-brand-assets.mjs tests/brand-assets.test.ts apps/desktop
rtk git commit -m "feat: add shared brand package and asset sync"
```

---

### Task 3: Add Shared UI Package

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/cn.ts`
- Create: `packages/ui/src/BrandMark.tsx`
- Create: `packages/ui/src/BrandMark.test.tsx`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src/components/Logo.tsx`
- Modify: `apps/desktop/src/index.css`
- Modify: all current `@/lib/utils` import sites under `apps/desktop/src`
- Delete: `apps/desktop/src/lib/utils.ts`

- [ ] **Step 1: Create the UI package manifest**

Create `packages/ui/package.json`:

```json
{
  "name": "@beaver/ui",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest --environment jsdom",
    "test:run": "vitest run --environment jsdom",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@beaver/brand": "workspace:*",
    "clsx": "catalog:",
    "react": "catalog:",
    "tailwind-merge": "catalog:"
  },
  "devDependencies": {
    "@testing-library/react": "catalog:",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "jsdom": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Create `packages/ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Add `cn`, `BrandMark`, and tests**

Create `packages/ui/src/cn.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Create `packages/ui/src/BrandMark.tsx`:

```tsx
import { brandAssets } from "@beaver/brand";

import { cn } from "./cn";

export interface BrandMarkProps {
  size?: number;
  className?: string;
  alt?: string;
  decorative?: boolean;
}

export function BrandMark({
  size = 40,
  className,
  alt = "Beaver",
  decorative = false,
}: BrandMarkProps) {
  return (
    <img
      src={brandAssets.head}
      alt={decorative ? "" : alt}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      draggable={false}
      className={cn("select-none", className)}
    />
  );
}
```

Create `packages/ui/src/index.ts`:

```ts
export { BrandMark, type BrandMarkProps } from "./BrandMark";
export { cn } from "./cn";
```

Create `packages/ui/src/BrandMark.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { BrandMark } from ".";

describe("BrandMark", () => {
  it("renders the shared beaver mark", () => {
    render(<BrandMark alt="Beaver logo" />);
    expect(screen.getByAltText("Beaver logo").getAttribute("src")).toBe("/beaver-head.webp");
  });

  it("can render decoratively", () => {
    const { container } = render(<BrandMark decorative />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("aria-hidden")).toBe("true");
  });
});
```

- [ ] **Step 3: Point desktop imports to shared UI**

In `apps/desktop/package.json`, add the shared UI dependency:

```json
"@beaver/ui": "workspace:*"
```

Then remove these direct desktop dependencies because `cn` now lives in
`@beaver/ui`:

```json
"clsx": "catalog:",
"tailwind-merge": "catalog:"
```

Replace every desktop import of `@/lib/utils`:

```bash
rtk proxy sh -c 'rg -l "from \"@/lib/utils\"" apps/desktop/src | xargs perl -pi -e "s/from \"@\\/lib\\/utils\"/from \"@beaver\\/ui\"/g"'
rtk git rm apps/desktop/src/lib/utils.ts
```

Replace `apps/desktop/src/components/Logo.tsx` with:

```tsx
import { BrandMark, cn } from "@beaver/ui";

interface Props {
  size?: number;
  className?: string;
  /** Animate the mark with a soft amber pulse. */
  live?: boolean;
}

/**
 * Beaver mark — the app's mascot head, used everywhere the brand shows up.
 */
export function Logo({ size = 40, className, live = false }: Props) {
  return (
    <BrandMark
      size={size}
      decorative
      className={cn(live && "animate-beaver-pulse", className)}
    />
  );
}
```

- [ ] **Step 4: Add Tailwind source coverage for shared UI**

Add this line immediately after the imports in `apps/desktop/src/index.css`:

```css
@source "../../../packages/ui/src";
```

- [ ] **Step 5: Verify Task 3**

Run:

```bash
rtk pnpm install
rtk pnpm --filter @beaver/ui test:run
rtk pnpm --filter @beaver/desktop test:run
rtk pnpm --filter @beaver/desktop typecheck
```

Expected: UI tests pass, desktop tests still pass with the local `Logo`
wrapper, and TypeScript resolves both workspace packages.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
rtk git add package.json pnpm-lock.yaml packages/ui apps/desktop
rtk git commit -m "feat: share brand mark and class utilities"
```

---

### Task 4: Update README And Run Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update development commands**

In `README.md`, replace the Development, Testing, Build, and Project layout
sections so they describe the workspace:

````md
## Development

```bash
pnpm install
pnpm dev          # run all app dev servers; currently the desktop Vite frontend
pnpm tauri dev    # run the native macOS app
```

## Testing

```bash
pnpm test:run
pnpm typecheck
cd apps/desktop/src-tauri && cargo test
```

## Build

```bash
pnpm build
pnpm tauri build
```

## Project layout

```text
apps/
  desktop/                 React frontend and Tauri shell
packages/
  brand/                   Product metadata and canonical brand assets
  ui/                      Shared React primitives
scripts/                   Workspace automation and release scripts
tests/                     Workspace contract tests
```
````

- [ ] **Step 2: Search for stale paths**

Run:

```bash
rtk rg -n '(^|[^/])src-tauri/|(^|[^/])src/|website|apps/website|public/beaver-head|Tauri \\+ React' README.md package.json pnpm-workspace.yaml turbo.json scripts tests apps packages --glob '!apps/desktop/src-tauri/target/**'
```

Expected: no output. Exit code 1 from `rg` is acceptable here because it means
there were no matches.

- [ ] **Step 3: Run full verification**

Run:

```bash
rtk pnpm install
rtk pnpm sync:assets --check
rtk pnpm test:run
rtk pnpm typecheck
rtk pnpm build
```

Then run Rust tests:

```bash
cd apps/desktop/src-tauri && rtk cargo test
```

Expected: all commands pass.

- [ ] **Step 4: Smoke-test root dev script pattern**

Run:

```bash
rtk pnpm dev
```

Expected: Turbo starts `@beaver/desktop#dev` on Vite port `1420`. Stop it with
`Ctrl-C` after the server is up.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
rtk git add README.md package.json pnpm-lock.yaml apps packages scripts tests turbo.json pnpm-workspace.yaml
rtk git commit -m "docs: update monorepo usage"
```

---

## Completion Checklist

- [ ] `apps/desktop` exists.
- [ ] `apps/website` does not exist.
- [ ] Root `pnpm dev` uses the `apps/*` pattern.
- [ ] Root `pnpm tauri dev` runs the native desktop app explicitly.
- [ ] `@beaver/brand` has no React dependency.
- [ ] `@beaver/ui` only exports `BrandMark` and `cn`.
- [ ] Brand assets sync byte-for-byte into `apps/desktop/public`.
- [ ] No Vite/Tauri starter assets remain.
- [ ] Release tests ignore local signing credentials by default.
- [ ] All full verification commands pass.
