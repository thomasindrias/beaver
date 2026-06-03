# pnpm Monorepo Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Beaver into a pnpm/Turborepo monorepo with desktop and website apps, focused shared brand and UI packages, one lockfile, and preserved desktop development and release commands.

**Architecture:** Move the Vite/Tauri desktop app and Next.js website into `apps/`, then add `@beaver/brand` for framework-neutral metadata and canonical assets and `@beaver/ui` for the demonstrated shared React surface. The repository root owns pnpm/Turbo orchestration, asset synchronization, workspace tests, and compatibility aliases; each app keeps its own theme and app-specific components.

**Tech Stack:** pnpm 10.33.0, Turborepo 2.9.16, React 19, TypeScript 5.8, Vite 7, Next.js 16.2.7, Tauri 2, Vitest 4.

---

## Working Tree Note

`website/` is currently untracked user work. Preserve its contents exactly when
moving it to `apps/website`; do not recreate or discard it. The approved design
spec is:

`docs/superpowers/specs/2026-06-03-pnpm-monorepo-design.md`

## File Structure

| File or directory | Action | Responsibility |
|---|---|---|
| `package.json` | Replace | Root Turbo commands, focused aliases, package manager pin |
| `pnpm-workspace.yaml` | Create | Workspace packages and shared dependency catalog |
| `turbo.json` | Create | Dependency-aware build, test, typecheck, and dev tasks |
| `pnpm-lock.yaml` | Regenerate | Single workspace lockfile |
| `tests/workspace-config.test.ts` | Create | Verify root workspace contract |
| `scripts/sync-brand-assets.mjs` | Create | Copy canonical shared assets into app public directories |
| `apps/desktop/` | Create by move | Existing Vite/Tauri desktop application |
| `apps/website/` | Create by move | Existing Next.js marketing website |
| `packages/brand/package.json` | Create | Framework-neutral brand package manifest |
| `packages/brand/tsconfig.json` | Create | Brand package TypeScript configuration |
| `packages/brand/src/index.ts` | Create | Product metadata, external links, public asset paths |
| `packages/brand/src/index.test.ts` | Create | Brand metadata contract tests |
| `packages/brand/src/assets.test.ts` | Create | Canonical asset and committed-copy drift tests |
| `packages/brand/assets/` | Create | Canonical shared asset files |
| `packages/ui/package.json` | Create | Shared React package manifest |
| `packages/ui/tsconfig.json` | Create | Shared UI TypeScript configuration |
| `packages/ui/vitest.config.ts` | Create | Shared UI jsdom test configuration |
| `packages/ui/src/index.ts` | Create | Public UI exports |
| `packages/ui/src/cn.ts` | Create | Shared class-name merge helper |
| `packages/ui/src/brand-mark.tsx` | Create | Shared normal-`img` brand mark |
| `packages/ui/src/index.test.tsx` | Create | Shared UI contract tests |
| `README.md` | Modify | Document monorepo layout and root command pattern |

## Task 1: Move Both Applications Into a pnpm/Turbo Workspace

**Files:**
- Create: `tests/workspace-config.test.ts`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Replace: `package.json`
- Modify: `.gitignore`
- Move: `package.json` → `apps/desktop/package.json`
- Move: `src/` → `apps/desktop/src/`
- Move: `src-tauri/` → `apps/desktop/src-tauri/`
- Move: `public/` → `apps/desktop/public/`
- Move: `scripts/` → `apps/desktop/scripts/`
- Move: `index.html` → `apps/desktop/index.html`
- Move: `vite.config.ts` → `apps/desktop/vite.config.ts`
- Move: `tsconfig.json` → `apps/desktop/tsconfig.json`
- Move: `tsconfig.node.json` → `apps/desktop/tsconfig.node.json`
- Move: `components.json` → `apps/desktop/components.json`
- Move: `.env.release.example` → `apps/desktop/.env.release.example`
- Move: `website/` → `apps/website/`
- Delete: `apps/website/pnpm-lock.yaml`
- Modify: `apps/desktop/package.json`
- Modify: `apps/website/package.json`
- Modify: `apps/desktop/scripts/release-macos.sh`
- Modify: `apps/desktop/src/tests/release-script.test.ts`
- Regenerate: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing workspace configuration test**

Create `tests/workspace-config.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
const turbo = JSON.parse(readFileSync("turbo.json", "utf8"));

describe("workspace layout", () => {
  it("contains both applications", () => {
    expect(existsSync("apps/desktop/package.json")).toBe(true);
    expect(existsSync("apps/website/package.json")).toBe(true);
  });

  it("registers app and package directories", () => {
    expect(workspace).toContain("- apps/*");
    expect(workspace).toContain("- packages/*");
  });
});

describe("root command contract", () => {
  it("uses Turbo for workspace-wide commands", () => {
    expect(rootPackage.scripts).toMatchObject({
      dev: "turbo run dev",
      build: "turbo run build",
      test: "turbo run test",
      "test:run": "pnpm test:config && turbo run test:run",
      typecheck: "turbo run typecheck",
    });
  });

  it("preserves desktop compatibility aliases", () => {
    expect(rootPackage.scripts).toMatchObject({
      preview: "pnpm --filter @beaver/desktop run preview --",
      tauri: "pnpm --filter @beaver/desktop run tauri --",
      "tauri:onboarding":
        "pnpm --filter @beaver/desktop run tauri:onboarding --",
      "release:mac": "pnpm --filter @beaver/desktop run release:mac --",
    });
  });
});

describe("Turbo task contract", () => {
  it("keeps development and watch tests persistent and uncached", () => {
    expect(turbo.tasks.dev).toEqual({ cache: false, persistent: true });
    expect(turbo.tasks.test).toEqual({ cache: false, persistent: true });
  });

  it("makes builds, tests, and typechecks dependency-aware", () => {
    expect(turbo.tasks.build.dependsOn).toEqual(["^build"]);
    expect(turbo.tasks["test:run"].dependsOn).toEqual(["^test:run"]);
    expect(turbo.tasks.typecheck.dependsOn).toEqual(["^typecheck"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec vitest run tests/workspace-config.test.ts
```

Expected: FAIL because `pnpm-workspace.yaml`, `turbo.json`, and the `apps/`
directories do not exist.

- [ ] **Step 3: Move the existing applications**

Run:

```bash
mkdir -p apps
git mv package.json apps/desktop-package.json
mkdir -p apps/desktop
git mv apps/desktop-package.json apps/desktop/package.json
git mv src src-tauri public scripts index.html vite.config.ts tsconfig.json tsconfig.node.json components.json .env.release.example apps/desktop/
mv website apps/website
rm apps/website/pnpm-lock.yaml
```

Expected: the tracked desktop application is represented as Git moves, the
untracked website is preserved under `apps/website`, and the root lockfile is
the only remaining pnpm lockfile.

- [ ] **Step 4: Create the root workspace configuration**

Create the root `package.json`:

```json
{
  "name": "@beaver/workspace",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:run": "pnpm test:config && turbo run test:run",
    "test:config": "vitest run tests",
    "typecheck": "turbo run typecheck",
    "preview": "pnpm --filter @beaver/desktop run preview --",
    "tauri": "pnpm --filter @beaver/desktop run tauri --",
    "tauri:onboarding": "pnpm --filter @beaver/desktop run tauri:onboarding --",
    "release:mac": "pnpm --filter @beaver/desktop run release:mac --",
    "desktop:dev": "pnpm --filter @beaver/desktop run dev",
    "desktop:build": "pnpm --filter @beaver/desktop run build",
    "desktop:test": "pnpm --filter @beaver/desktop run test:run",
    "desktop:typecheck": "pnpm --filter @beaver/desktop run typecheck",
    "website:dev": "pnpm --filter @beaver/website run dev",
    "website:build": "pnpm --filter @beaver/website run build",
    "website:test": "pnpm --filter @beaver/website run test:run",
    "website:typecheck": "pnpm --filter @beaver/website run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.9.16",
    "vitest": "catalog:"
  },
  "packageManager": "pnpm@10.33.0"
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*

catalog:
  "@fontsource-variable/geist": ^5.2.9
  "@testing-library/jest-dom": ^6.9.1
  "@testing-library/react": ^16.3.2
  "@testing-library/user-event": ^14.6.1
  "@types/node": ^25.9.1
  "@types/react": ^19.2.15
  "@types/react-dom": ^19.2.3
  class-variance-authority: ^0.7.1
  clsx: ^2.1.1
  jsdom: ^29.1.1
  lucide-react: ^1.17.0
  react: ^19.2.6
  react-dom: ^19.2.6
  tailwind-merge: ^3.6.0
  tailwindcss: ^4.3.0
  typescript: ~5.8.3
  vitest: ^4.1.7
```

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "out/**"]
    },
    "test": {
      "cache": false,
      "persistent": true
    },
    "test:run": {
      "dependsOn": ["^test:run"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Append these generated-output entries to `.gitignore`:

```gitignore
.turbo/
.next/
out/
tsconfig.tsbuildinfo
```

- [ ] **Step 5: Update both application manifests**

Replace `apps/desktop/package.json` with:

```json
{
  "name": "@beaver/desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri:onboarding": "BEAVER_FORCE_ONBOARDING=1 tauri dev",
    "test": "vitest",
    "test:run": "vitest run --passWithNoTests",
    "release:mac": "bash scripts/release-macos.sh"
  },
  "dependencies": {
    "@base-ui/react": "^1.5.0",
    "@fontsource-variable/geist": "catalog:",
    "@tauri-apps/api": "^2.11.0",
    "@tauri-apps/plugin-sql": "^2.4.0",
    "class-variance-authority": "catalog:",
    "clsx": "catalog:",
    "lucide-react": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "shadcn": "^4.9.0",
    "tailwind-merge": "catalog:",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.0",
    "@tauri-apps/cli": "^2.11.2",
    "@testing-library/jest-dom": "catalog:",
    "@testing-library/react": "catalog:",
    "@testing-library/user-event": "catalog:",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "^4.7.0",
    "@vitest/ui": "^4.1.7",
    "jsdom": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:",
    "vite": "^7.3.3",
    "vitest": "catalog:"
  }
}
```

Replace `apps/website/package.json` with:

```json
{
  "name": "@beaver/website",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@fontsource-variable/geist": "catalog:",
    "@radix-ui/react-accordion": "^1.2.12",
    "clsx": "catalog:",
    "lucide-react": "catalog:",
    "next": "16.2.7",
    "react": "catalog:",
    "react-dom": "catalog:",
    "tailwind-merge": "catalog:"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.17",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "tailwindcss": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 6: Write the failing release compatibility test**

Replace `apps/desktop/src/tests/release-script.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function printMode(identity: string): string {
  return execFileSync("bash", ["scripts/release-macos.sh", "--print-mode"], {
    encoding: "utf8",
    env: {
      ...process.env,
      APPLE_SIGNING_IDENTITY: identity,
      BEAVER_RELEASE_ENV_FILE: "/dev/null",
    },
  }).trim();
}

describe("release-macos.sh", () => {
  it("reports unsigned without a signing identity", () => {
    expect(printMode("")).toBe("unsigned");
  });

  it("reports signed when a signing identity is set", () => {
    expect(
      printMode("Developer ID Application: DJTL AB (Z7HLVJ93DA)")
    ).toBe("signed");
  });
});

describe("release wiring", () => {
  it("documents credentials in .env.release.example", () => {
    const example = readFileSync(".env.release.example", "utf8");
    expect(example).toContain("APPLE_SIGNING_IDENTITY");
    expect(example).toContain("APPLE_TEAM_ID");
  });

  it("gitignores the real .env.release at workspace or app level", () => {
    expect(readFileSync(join(workspaceRoot, ".gitignore"), "utf8")).toContain(
      ".env.release"
    );
  });

  it("loads credentials from the workspace root for migration compatibility", () => {
    const script = readFileSync("scripts/release-macos.sh", "utf8");
    expect(script).toContain('"$WORKSPACE_ROOT/.env.release"');
  });

  it("allows callers to select a release credential file", () => {
    const script = readFileSync("scripts/release-macos.sh", "utf8");
    expect(script).toContain("BEAVER_RELEASE_ENV_FILE");
  });

  it("exposes a release:mac script", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["release:mac"]).toContain("release-macos.sh");
  });

  it("keeps the example file", () => {
    expect(existsSync(".env.release.example")).toBe(true);
  });
});

describe("headless dmg packaging", () => {
  it("packages the DMG with dmgbuild without Finder scripting", () => {
    const script = readFileSync("scripts/release-macos.sh", "utf8");
    expect(script).toContain("dmgbuild");
    expect(script).toContain("scripts/dmgbuild-settings.py");
  });

  it("ships a dmgbuild settings file with the install layout", () => {
    const settings = readFileSync("scripts/dmgbuild-settings.py", "utf8");
    expect(settings).toContain("symlinks");
    expect(settings).toContain("Applications");
    expect(settings).toContain("icon_locations");
    expect(settings).toContain("BEAVER_APP");
  });
});
```

Run:

```bash
pnpm install
pnpm --filter @beaver/desktop exec vitest run src/tests/release-script.test.ts
```

Expected: FAIL because the moved release script does not yet support
`WORKSPACE_ROOT` or `BEAVER_RELEASE_ENV_FILE`.

- [ ] **Step 7: Preserve release credentials and root release behavior**

Replace the opening root-resolution and credential-loading block in
`apps/desktop/scripts/release-macos.sh` with:

```bash
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$APP_ROOT/../.." && pwd)"
cd "$APP_ROOT"

# Prefer app-local credentials, while continuing to honor the workspace-root
# file used before the monorepo migration. Callers can select a specific file
# with BEAVER_RELEASE_ENV_FILE; /dev/null is useful for environment-only runs.
release_env="${BEAVER_RELEASE_ENV_FILE:-}"
if [[ -z "$release_env" ]]; then
  for candidate in "$APP_ROOT/.env.release" "$WORKSPACE_ROOT/.env.release"; do
    if [[ -f "$candidate" ]]; then
      release_env="$candidate"
      break
    fi
  done
fi
if [[ -n "$release_env" ]]; then
  if [[ ! -f "$release_env" ]]; then
    echo "error: release env file does not exist: $release_env" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$release_env"
  set +a
fi
```

Run:

```bash
pnpm --filter @beaver/desktop exec vitest run src/tests/release-script.test.ts
```

Expected: PASS.

- [ ] **Step 8: Install the workspace and verify the move**

Run:

```bash
pnpm install
pnpm test:config
pnpm --filter @beaver/desktop test:run
pnpm --filter @beaver/website test:run
pnpm typecheck
pnpm build
pnpm release:mac -- --print-mode
```

Expected:

- One root `pnpm-lock.yaml` contains importers for both apps.
- The workspace configuration test passes.
- Existing desktop and website tests pass from their new package directories.
- Typecheck and build pass through Turbo.
- The release mode command prints `signed` or `unsigned`, matching available
  credentials, without building a release.

- [ ] **Step 9: Commit the workspace migration**

```bash
git add -A apps package.json pnpm-workspace.yaml turbo.json pnpm-lock.yaml tests .gitignore
git commit -m "refactor: move apps into pnpm workspace"
```

## Task 2: Add the Framework-Neutral Brand Package

**Files:**
- Create: `packages/brand/package.json`
- Create: `packages/brand/tsconfig.json`
- Create: `packages/brand/src/index.test.ts`
- Create: `packages/brand/src/index.ts`
- Modify: `apps/website/package.json`
- Modify: `apps/website/next.config.ts`
- Modify: `apps/website/lib/site-content.ts`
- Modify: `apps/website/lib/site-content.test.ts`
- Regenerate: `pnpm-lock.yaml`

- [ ] **Step 1: Create the brand package scaffold and failing metadata test**

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
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src"]
}
```

Create `packages/brand/src/index.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { brandAssets, externalLinks, product } from "./index";

describe("Beaver brand contract", () => {
  it("publishes stable product metadata", () => {
    expect(product).toEqual({
      name: "Beaver",
      version: "0.1.0",
      title: "Beaver - Screenshot in. Markdown out.",
      description:
        "Beaver is a private macOS menu-bar utility that turns any screen region into clean Markdown with fully on-device vision.",
      constraints: "Apple Silicon · macOS 13+ · Free",
    });
  });

  it("publishes stable external links", () => {
    expect(externalLinks).toEqual({
      download: "https://github.com/thomasindrias/beaver/releases/latest",
      github: "https://github.com/thomasindrias/beaver",
      company: "https://djtl.se",
      linkedin: "https://www.linkedin.com/in/thomas-indrias",
    });
  });

  it("publishes stable public asset paths", () => {
    expect(brandAssets).toEqual({
      mark: "/beaver-head.webp",
      favicon: "/favicon.ico",
    });
  });
});
```

- [ ] **Step 2: Install and run the test to verify it fails**

Run:

```bash
pnpm install
pnpm --filter @beaver/brand test:run
```

Expected: FAIL because `packages/brand/src/index.ts` does not exist.

- [ ] **Step 3: Implement the brand exports**

Create `packages/brand/src/index.ts`:

```typescript
export const product = {
  name: "Beaver",
  version: "0.1.0",
  title: "Beaver - Screenshot in. Markdown out.",
  description:
    "Beaver is a private macOS menu-bar utility that turns any screen region into clean Markdown with fully on-device vision.",
  constraints: "Apple Silicon · macOS 13+ · Free",
} as const;

export const externalLinks = {
  download: "https://github.com/thomasindrias/beaver/releases/latest",
  github: "https://github.com/thomasindrias/beaver",
  company: "https://djtl.se",
  linkedin: "https://www.linkedin.com/in/thomas-indrias",
} as const;

export const brandAssets = {
  mark: "/beaver-head.webp",
  favicon: "/favicon.ico",
} as const;
```

- [ ] **Step 4: Make the website consume brand metadata**

Add the workspace dependency to `apps/website/package.json`:

```json
"@beaver/brand": "workspace:*"
```

Replace `apps/website/next.config.ts` with:

```typescript
import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appRoot, "../..");

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  transpilePackages: ["@beaver/brand"],
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
```

At the top of `apps/website/lib/site-content.ts`, add:

```typescript
import { brandAssets, externalLinks, product } from "@beaver/brand";
```

Replace the existing `ctaLinks` and `siteMeta` declarations with:

```typescript
export const ctaLinks = externalLinks;

export const siteMeta = {
  ...product,
  version: `v${product.version}`,
} as const;
```

Replace the current mark entry inside `assetSlots` with:

```typescript
  {
    path: "/beaver-head.svg",
    label: "Final beaver-head SVG logo mark",
    current: brandAssets.mark,
  },
```

Replace the favicon entry inside `assetSlots` with:

```typescript
  {
    path: brandAssets.favicon,
    label: "Browser favicon",
    current: "Existing app icon",
  },
```

Add this assertion to the first test in
`apps/website/lib/site-content.test.ts`:

```typescript
expect(siteMeta.name).toBe("Beaver");
```

- [ ] **Step 5: Run brand and website verification**

Run:

```bash
pnpm install
pnpm --filter @beaver/brand test:run
pnpm --filter @beaver/website test:run
pnpm --filter @beaver/brand typecheck
pnpm --filter @beaver/website typecheck
pnpm --filter @beaver/website build
```

Expected: all commands pass, and Next.js resolves the local TypeScript brand
package through `transpilePackages`.

- [ ] **Step 6: Commit the brand metadata package**

```bash
git add packages/brand apps/website/package.json apps/website/next.config.ts apps/website/lib pnpm-lock.yaml
git commit -m "refactor: add shared brand metadata package"
```

## Task 3: Make Shared Assets Canonical and Synchronized

**Files:**
- Create: `packages/brand/src/assets.test.ts`
- Create: `packages/brand/assets/beaver-head.webp`
- Create: `packages/brand/assets/favicon.ico`
- Create: `scripts/sync-brand-assets.mjs`
- Modify: `package.json`
- Modify: `tests/workspace-config.test.ts`
- Modify: `apps/desktop/index.html`
- Modify: `apps/website/app/layout.tsx`
- Create by sync: `apps/desktop/public/favicon.ico`
- Verify by sync: `apps/desktop/public/beaver-head.webp`
- Verify by sync: `apps/website/public/favicon.ico`
- Verify by sync: `apps/website/public/beaver-head.webp`
- Delete: `apps/website/public/beaver-animations/beaver-wave.webp`
- Delete: `apps/desktop/public/vite.svg`
- Delete: `apps/desktop/public/tauri.svg`
- Delete: `apps/desktop/src/assets/react.svg`

- [ ] **Step 1: Write the failing asset drift test**

Create `packages/brand/src/assets.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const sharedAssets = [
  "beaver-head.webp",
  "favicon.ico",
] as const;
const appPublicDirs = [
  "apps/desktop/public",
  "apps/website/public",
] as const;

describe("shared brand assets", () => {
  for (const asset of sharedAssets) {
    const source = join(workspaceRoot, "packages/brand/assets", asset);

    for (const publicDir of appPublicDirs) {
      const destination = join(workspaceRoot, publicDir, asset);

      it(`${destination} matches ${source}`, () => {
        const canonical = readFileSync(source);
        const committedCopy = readFileSync(destination);
        expect(
          committedCopy.equals(canonical),
          `${destination} differs from ${source}`
        ).toBe(true);
      });
    }
  }
});
```

Update the root command assertions in `tests/workspace-config.test.ts` to:

```typescript
expect(rootPackage.scripts).toMatchObject({
  dev: "pnpm sync:assets && turbo run dev",
  build: "pnpm sync:assets && turbo run build",
  test: "turbo run test",
  "test:run": "pnpm test:config && turbo run test:run",
  typecheck: "turbo run typecheck",
  "sync:assets": "node scripts/sync-brand-assets.mjs",
});
```

Update the desktop compatibility alias assertions to:

```typescript
expect(rootPackage.scripts).toMatchObject({
  preview: "pnpm --filter @beaver/desktop run preview --",
  tauri: "pnpm sync:assets && pnpm --filter @beaver/desktop run tauri --",
  "tauri:onboarding":
    "pnpm sync:assets && pnpm --filter @beaver/desktop run tauri:onboarding --",
  "release:mac":
    "pnpm sync:assets && pnpm --filter @beaver/desktop run release:mac --",
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm test:config
pnpm --filter @beaver/brand test:run
```

Expected:

- The root config test fails because `sync:assets` is not wired.
- The brand asset test fails because `packages/brand/assets/` does not exist.

- [ ] **Step 3: Create the asset synchronization script**

Create `scripts/sync-brand-assets.mjs`:

```javascript
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalDir = join(workspaceRoot, "packages/brand/assets");
const appPublicDirs = [
  join(workspaceRoot, "apps/desktop/public"),
  join(workspaceRoot, "apps/website/public"),
];
const sharedAssets = [
  "beaver-head.webp",
  "favicon.ico",
];

for (const asset of sharedAssets) {
  const source = join(canonicalDir, asset);
  if (!existsSync(source)) {
    throw new Error(`missing canonical asset: ${source}`);
  }

  for (const publicDir of appPublicDirs) {
    const destination = join(publicDir, asset);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    console.log(`synced ${asset} -> ${destination}`);
  }
}
```

- [ ] **Step 4: Seed canonical assets and sync committed copies**

Run:

```bash
mkdir -p packages/brand/assets
cp apps/desktop/public/beaver-head.webp packages/brand/assets/beaver-head.webp
cp apps/website/public/favicon.ico packages/brand/assets/favicon.ico
node scripts/sync-brand-assets.mjs
```

Expected: the script copies both canonical files into both app public
directories, including a new desktop `favicon.ico`.

- [ ] **Step 5: Wire asset synchronization into root commands**

Replace the root `package.json` scripts object with:

```json
{
  "dev": "pnpm sync:assets && turbo run dev",
  "build": "pnpm sync:assets && turbo run build",
  "test": "turbo run test",
  "test:run": "pnpm test:config && turbo run test:run",
  "test:config": "vitest run tests",
  "typecheck": "turbo run typecheck",
  "sync:assets": "node scripts/sync-brand-assets.mjs",
  "preview": "pnpm --filter @beaver/desktop run preview --",
  "tauri": "pnpm sync:assets && pnpm --filter @beaver/desktop run tauri --",
  "tauri:onboarding": "pnpm sync:assets && pnpm --filter @beaver/desktop run tauri:onboarding --",
  "release:mac": "pnpm sync:assets && pnpm --filter @beaver/desktop run release:mac --",
  "desktop:dev": "pnpm sync:assets && pnpm --filter @beaver/desktop run dev",
  "desktop:build": "pnpm sync:assets && pnpm --filter @beaver/desktop run build",
  "desktop:test": "pnpm --filter @beaver/desktop run test:run",
  "desktop:typecheck": "pnpm --filter @beaver/desktop run typecheck",
  "website:dev": "pnpm sync:assets && pnpm --filter @beaver/website run dev",
  "website:build": "pnpm sync:assets && pnpm --filter @beaver/website run build",
  "website:test": "pnpm --filter @beaver/website run test:run",
  "website:typecheck": "pnpm --filter @beaver/website run typecheck"
}
```

- [ ] **Step 6: Make both apps reference the shared asset contract**

Replace `apps/desktop/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beaver</title>
  </head>

  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Add `brandAssets` to the imports in `apps/website/app/layout.tsx`:

```typescript
import { brandAssets } from "@beaver/brand";
```

Replace the website metadata icon declaration with:

```typescript
  icons: {
    icon: brandAssets.favicon,
  },
```

Remove unused starter assets:

```bash
git rm apps/desktop/public/vite.svg apps/desktop/public/tauri.svg apps/desktop/src/assets/react.svg apps/website/public/beaver-animations/beaver-wave.webp
```

- [ ] **Step 7: Run asset and workspace verification**

Run:

```bash
pnpm sync:assets
pnpm test:config
pnpm --filter @beaver/brand test:run
pnpm test:run
pnpm typecheck
pnpm build
```

Expected: all commands pass, and the brand asset test proves every committed
copy is byte-for-byte equal to its canonical source.

- [ ] **Step 8: Commit canonical shared assets**

```bash
git add package.json tests/workspace-config.test.ts scripts packages/brand apps/desktop apps/website
git commit -m "refactor: centralize shared brand assets"
```

## Task 4: Add the Shared React UI Package

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/src/test-setup.ts`
- Create: `packages/ui/src/index.test.tsx`
- Create: `packages/ui/src/cn.ts`
- Create: `packages/ui/src/brand-mark.tsx`
- Create: `packages/ui/src/index.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/website/package.json`
- Modify: `apps/website/next.config.ts`
- Modify: `apps/desktop/components.json`
- Modify: `apps/desktop/src/index.css`
- Modify: `apps/website/app/globals.css`
- Modify: `apps/desktop/src/components/Logo.tsx`
- Modify: `apps/website/components/ui/logo.tsx`
- Modify: all current `@/lib/utils` consumers under both apps
- Delete: `apps/desktop/src/lib/utils.ts`
- Delete: `apps/website/lib/utils.ts`
- Regenerate: `pnpm-lock.yaml`

- [ ] **Step 1: Create the shared UI scaffold and failing tests**

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
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@beaver/brand": "workspace:*",
    "clsx": "catalog:",
    "tailwind-merge": "catalog:"
  },
  "peerDependencies": {
    "react": "catalog:"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "catalog:",
    "@testing-library/react": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "jsdom": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Create `packages/ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

Create `packages/ui/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

Create `packages/ui/src/test-setup.ts`:

```typescript
import "@testing-library/jest-dom";
```

Create `packages/ui/src/index.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { brandAssets } from "@beaver/brand";
import { BrandMark, cn } from "./index";

describe("cn", () => {
  it("merges conflicting Tailwind utility classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("BrandMark", () => {
  it("renders the shared mark path with an accessible label", () => {
    render(<BrandMark alt="Beaver mascot head" size={24} className="custom" />);

    const mark = screen.getByRole("img", { name: "Beaver mascot head" });
    expect(mark).toHaveAttribute("src", brandAssets.mark);
    expect(mark).toHaveAttribute("width", "24");
    expect(mark).toHaveAttribute("height", "24");
    expect(mark).toHaveClass("custom");
  });

  it("is decorative by default", () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelector("img")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });
});
```

- [ ] **Step 2: Install and run the test to verify it fails**

Run:

```bash
pnpm install
pnpm --filter @beaver/ui test:run
```

Expected: FAIL because `packages/ui/src/index.ts` does not exist.

- [ ] **Step 3: Implement `cn` and `BrandMark`**

Create `packages/ui/src/cn.ts`:

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Create `packages/ui/src/brand-mark.tsx`:

```typescript
import { brandAssets } from "@beaver/brand";
import { cn } from "./cn";

export type BrandMarkProps = {
  alt?: string;
  className?: string;
  size?: number;
};

export function BrandMark({
  alt = "",
  className,
  size = 40,
}: BrandMarkProps) {
  const decorative = alt === "";

  return (
    <img
      src={brandAssets.mark}
      alt={alt}
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

```typescript
export { BrandMark, type BrandMarkProps } from "./brand-mark";
export { cn } from "./cn";
```

- [ ] **Step 4: Run the shared UI tests**

Run:

```bash
pnpm --filter @beaver/ui test:run
pnpm --filter @beaver/ui typecheck
```

Expected: PASS.

- [ ] **Step 5: Make both applications consume `@beaver/ui`**

Add this dependency to both `apps/desktop/package.json` and
`apps/website/package.json`:

```json
"@beaver/ui": "workspace:*"
```

Remove these direct dependencies from both app manifests:

```json
"clsx": "catalog:",
"tailwind-merge": "catalog:"
```

Replace `apps/website/next.config.ts` with:

```typescript
import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appRoot, "../..");

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  transpilePackages: ["@beaver/brand", "@beaver/ui"],
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
```

Replace `apps/desktop/src/components/Logo.tsx` with:

```typescript
import { BrandMark, cn } from "@beaver/ui";

interface Props {
  size?: number;
  className?: string;
  /** Animate the mark with a soft amber pulse. */
  live?: boolean;
}

/**
 * Beaver mark used across desktop application surfaces.
 */
export function Logo({ size = 40, className, live = false }: Props) {
  return (
    <BrandMark
      size={size}
      className={cn(live && "animate-beaver-pulse", className)}
    />
  );
}
```

Replace `apps/website/components/ui/logo.tsx` with:

```typescript
import { BrandMark, cn } from "@beaver/ui";

type LogoProps = {
  className?: string;
  markClassName?: string;
};

export function Logo({ className, markClassName }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark
        alt="Beaver mascot head"
        size={40}
        className={cn("size-9", markClassName)}
      />
      <span className="text-base font-semibold text-stone-50">Beaver</span>
    </span>
  );
}
```

Change the shadcn utils alias in `apps/desktop/components.json` to:

```json
"utils": "@beaver/ui"
```

Add this Tailwind v4 source directive immediately after the import lines in
both `apps/desktop/src/index.css` and `apps/website/app/globals.css`:

```css
@source "../../../packages/ui/src";
```

Mechanically replace every remaining local utils import:

```bash
rg -l 'from "@/lib/utils"' apps/desktop/src apps/website | xargs perl -pi -e 's/from "@\/lib\/utils"/from "@beaver\/ui"/g'
git rm apps/desktop/src/lib/utils.ts apps/website/lib/utils.ts
```

- [ ] **Step 6: Install and verify both application consumers**

Run:

```bash
pnpm install
pnpm --filter @beaver/ui test:run
pnpm --filter @beaver/desktop test:run
pnpm --filter @beaver/website test:run
pnpm typecheck
pnpm build
```

Expected: all commands pass. The existing desktop `Logo` tests verify its local
wrapper behavior, and the website build verifies Next.js transpiles both shared
source packages.

- [ ] **Step 7: Commit the shared UI package**

```bash
git add packages/ui apps/desktop apps/website pnpm-lock.yaml
git commit -m "refactor: add shared brand mark and utility package"
```

## Task 5: Document the Monorepo Command Pattern and Remove Stale Paths

**Files:**
- Modify: `README.md`
- Modify: `apps/website/components/sections/demo-video.tsx`

- [ ] **Step 1: Update the website-owned public path references**

In `apps/website/components/sections/demo-video.tsx`, replace every textual
reference to:

```text
website/public
```

with:

```text
apps/website/public
```

- [ ] **Step 2: Replace the README development and layout documentation**

Replace `README.md` with:

````markdown
# Beaver

A macOS menu-bar utility that turns a screenshot into structured data. Press a
shortcut, drag a box around anything on screen, and Beaver extracts what's
inside it as clean Markdown. Tables stay tables, lists stay lists, and code
stays code. Vision runs fully on-device after a one-time model download, so
captures never leave your machine.

> Apple Silicon only. The vision model runs on Apple's MLX framework, which
> requires an M-series Mac.

## Install (macOS, Apple Silicon)

1. Download `Beaver_<version>_aarch64.dmg`.
2. Open the DMG and drag **Beaver** into **Applications**.
3. Launch Beaver from Applications. Grant Screen Recording permission when asked.

> Unsigned builds: the first launch needs right-click → **Open** once to get
> past Gatekeeper. Signed and notarized builds open normally.

## How it works

1. `Cmd+Shift+D` opens a full-screen capture overlay.
2. You drag a bounding box around the region of interest.
3. The cropped image is sent to a local FastAPI server running
   `Qwen2.5-VL-3B-Instruct-4bit` via MLX.
4. The extracted Markdown is returned, stored in local SQLite history, and
   copied to your clipboard.

On first launch Beaver downloads the vision model and prepares an on-device
Python environment. A progress bar tracks the download; everything after setup
runs offline.

## Stack

- **Desktop shell:** Tauri 2 with a Rust core
- **Desktop frontend:** React 19, TypeScript, Vite 7, Tailwind CSS v4, shadcn
- **Website:** Next.js 16 static export
- **Vision backend:** Python FastAPI + MLX (`mlx-vlm`)
- **Storage:** SQLite via `tauri-plugin-sql`
- **Workspace:** pnpm + Turborepo

## Prerequisites

- macOS on Apple Silicon
- [Rust](https://rustup.rs) stable
- [Node.js](https://nodejs.org) + [pnpm](https://pnpm.io)
- [uv](https://github.com/astral-sh/uv)

## Development

```bash
pnpm install
pnpm dev          # desktop Vite frontend + Next.js website
pnpm tauri dev    # native desktop application
```

Focused commands follow a consistent app prefix:

```bash
pnpm desktop:dev
pnpm website:dev
pnpm desktop:test
pnpm website:test
```

## Testing

```bash
pnpm test:run
pnpm typecheck
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cd apps/desktop/src-tauri/resources && \
  uv run --no-project --with fastapi --with uvicorn --with pydantic --with tqdm \
  python test_mlx_server.py
```

## Build

```bash
pnpm build          # all workspace build tasks
pnpm desktop:build
pnpm website:build
pnpm tauri build    # native desktop bundle
```

## Building a macOS release

Requires Apple Silicon, Rust, pnpm, and the release prerequisites documented in
`apps/desktop/.env.release.example`.

```bash
pnpm release:mac
```

Without credentials this produces an unsigned DMG for local testing. With a
Developer ID identity and notarization credentials in either the workspace-root
`.env.release` or `apps/desktop/.env.release`, the script signs, notarizes, and
verifies the artifact.

## Project layout

```text
apps/
  desktop/
    src/                    React desktop frontend
    src-tauri/              Rust core and MLX server resources
    scripts/                macOS release and asset-generation tooling
    public/                 Desktop public assets
  website/
    app/                    Next.js app router pages and global styles
    components/             Marketing sections and website UI
    public/                 Website public assets
packages/
  brand/                    Product metadata and canonical shared assets
  ui/                       Shared BrandMark and cn helper
scripts/
  sync-brand-assets.mjs     Sync canonical assets into both apps
tests/
  workspace-config.test.ts  Root workspace contract
```
````

- [ ] **Step 3: Search for stale top-level application path references**

Run:

```bash
rg -n '(^|[^/])website/public|cd src-tauri|src-tauri/|public/beaver-head' README.md apps scripts tests --glob '!apps/desktop/src-tauri/target/**'
```

Expected:

- No top-level `website/public` references remain.
- Desktop-local `src-tauri` references remain only where they are correct
  inside `apps/desktop`.
- Root documentation uses `apps/desktop/src-tauri`.

- [ ] **Step 4: Run documentation-adjacent verification**

Run:

```bash
pnpm test:run
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit documentation and stale-path cleanup**

```bash
git add README.md apps/website/components/sections/demo-video.tsx
git commit -m "docs: document monorepo development workflow"
```

## Task 6: Run End-to-End Workspace Verification

**Files:**
- Verify only; no planned file changes

- [ ] **Step 1: Verify a clean install uses the single workspace lockfile**

Run:

```bash
pnpm install --frozen-lockfile
rg --files -uu -g 'pnpm-lock.yaml' -g '!**/node_modules/**'
```

Expected: install succeeds and the only printed lockfile is
`./pnpm-lock.yaml`.

- [ ] **Step 2: Run all automated workspace verification**

Run:

```bash
pnpm test:run
pnpm typecheck
pnpm build
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm release:mac -- --print-mode
```

Expected:

- Root config, brand, shared UI, desktop, and website tests pass.
- All TypeScript packages and apps typecheck.
- Desktop and website builds pass through Turbo.
- Rust tests pass.
- Release mode prints `signed` or `unsigned` without building a DMG.

- [ ] **Step 3: Verify `pnpm dev` starts both frontend applications**

Run:

```bash
pnpm dev
```

Expected: Turbo starts `@beaver/desktop#dev` with Vite on port `1420` and
`@beaver/website#dev` with Next.js on port `3000`. Stop the command with
`Ctrl-C` after both servers report ready.

- [ ] **Step 4: Verify the native desktop alias**

Run:

```bash
pnpm tauri dev
```

Expected: the Tauri desktop application starts and resolves the Vite frontend
from `apps/desktop`. Stop the command after confirming the app launches.

- [ ] **Step 5: Confirm the final working tree contains only intended changes**

Run:

```bash
git status --short
git log --oneline -n 6
```

Expected: the working tree is clean, and the recent commits correspond to the
workspace move, brand metadata, canonical assets, shared UI, and documentation.
