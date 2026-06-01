# macOS DMG Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a branded, signing-ready `Beaver.dmg` via `pnpm release:mac` that builds unsigned today and notarizes once a Developer ID cert is present.

> **Implementation update (2026-06-01):** Tauri's native DMG bundler drives Finder via AppleScript and fails non-interactively (`AppleEvent timed out -1712`). DMG packaging was moved to **`dmgbuild`** (headless; writes `.DS_Store` directly), run via `uv run --with dmgbuild`. Tauri now builds only `["app"]`; the window/background/icon layout lives in `scripts/dmgbuild-settings.py`. See the design spec's Components 1 & 4 for details.

**Architecture:** Build the signed `.app` with Tauri, regenerate the app icon from the beaver head, generate a branded background with Pillow, then package a branded DMG headlessly with `dmgbuild` — all wrapped in a two-mode (signed/unsigned) shell script with artifact verification. Signing is driven entirely by env vars so the same config builds both modes.

**Tech Stack:** Tauri 2, Rust (aarch64-apple-darwin), pnpm, Pillow (in `/tmp/beaver-venv`), vitest for verification tests, bash.

**Conventions:** Tests live in `src/tests/*.test.ts` (vitest, run from repo root with `pnpm exec vitest run`). Commit after each green task. The beaver-head source is `~/Downloads/beaver_head_transparent_app_icon.png`; the in-app mark is `public/beaver-head.webp`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/tests/tauri-config.test.ts` | Create | Assert DMG bundle config shape |
| `src-tauri/tauri.conf.json` | Modify | DMG block, targets, min version |
| `src/tests/dmg-background.test.ts` | Create | Assert background PNG dimensions |
| `scripts/gen-dmg-background.py` | Create | Generate branded DMG background (1x + @2x) |
| `src-tauri/dmg/background.png` (+`@2x`) | Create (generated) | DMG installer background |
| `scripts/gen-app-icon.py` | Create | Build 1024² squircle icon source from the head |
| `src-tauri/icons/*` | Regenerate | Beaver-head app icon, all sizes |
| `src/tests/release-script.test.ts` | Create | Assert signed/unsigned mode detection |
| `scripts/release-macos.sh` | Create | Build → (sign → notarize → verify) |
| `.env.release.example` | Create | Document required credentials |
| `.gitignore` | Modify | Ignore `.env.release` |
| `package.json` | Modify | `release:mac` script |
| `README.md` | Modify | "Install" + "Building a release" sections |

---

## Task 1: Tauri DMG bundle config

**Files:**
- Test: `src/tests/tauri-config.test.ts` (create)
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Write the failing test**

Create `src/tests/tauri-config.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));

describe("tauri bundle config", () => {
  it("targets only app and dmg", () => {
    expect(conf.bundle.targets).toEqual(["app", "dmg"]);
  });

  it("sets a macOS minimum system version", () => {
    expect(conf.bundle.macOS.minimumSystemVersion).toBe("13.0");
  });

  it("configures the dmg window and icon positions", () => {
    const dmg = conf.bundle.macOS.dmg;
    expect(dmg.background).toBe("dmg/background.png");
    expect(dmg.windowSize).toEqual({ width: 660, height: 420 });
    expect(dmg.appPosition).toEqual({ x: 180, y: 210 });
    expect(dmg.applicationFolderPosition).toEqual({ x: 480, y: 210 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/tests/tauri-config.test.ts`
Expected: FAIL — `bundle.targets` is `"all"`, `bundle.macOS.minimumSystemVersion`/`dmg` undefined.

- [ ] **Step 3: Edit `src-tauri/tauri.conf.json`**

Change `"targets": "all"` to `"targets": ["app", "dmg"]`, and replace the `macOS` block with:

```json
    "macOS": {
      "minimumSystemVersion": "13.0",
      "entitlements": "entitlements.plist",
      "infoPlist": "Info.plist",
      "dmg": {
        "background": "dmg/background.png",
        "windowSize": { "width": 660, "height": 420 },
        "appPosition": { "x": 180, "y": 210 },
        "applicationFolderPosition": { "x": 480, "y": 210 }
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/tests/tauri-config.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/tests/tauri-config.test.ts src-tauri/tauri.conf.json
git commit -m "feat: configure macOS DMG bundle (window, positions, target)"
```

---

## Task 2: Branded DMG background

**Files:**
- Test: `src/tests/dmg-background.test.ts` (create)
- Create: `scripts/gen-dmg-background.py`
- Create (generated): `src-tauri/dmg/background.png`, `src-tauri/dmg/background@2x.png`

- [ ] **Step 1: Write the failing test**

Create `src/tests/dmg-background.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

function pngSize(path: string) {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe("dmg background", () => {
  it("ships a 1x background at 660x420", () => {
    expect(pngSize("src-tauri/dmg/background.png")).toEqual({ width: 660, height: 420 });
  });

  it("ships a retina background at 1320x840", () => {
    expect(pngSize("src-tauri/dmg/background@2x.png")).toEqual({ width: 1320, height: 840 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/tests/dmg-background.test.ts`
Expected: FAIL — files do not exist (ENOENT).

- [ ] **Step 3: Create the generator `scripts/gen-dmg-background.py`**

```python
#!/usr/bin/env python3
"""Generate Beaver's branded DMG installer background (1x + @2x)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri" / "dmg"
HEAD = ROOT / "public" / "beaver-head.webp"

W, H = 660, 420
BG = (26, 23, 20)       # #1a1714
FG = (231, 226, 218)    # #e7e2da
MUTED = (154, 143, 128)  # #9a8f80
AMBER = (224, 164, 90)
DIVIDER = (54, 48, 42)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNS.ttf",
    "/Library/Fonts/Arial.ttf",
]


def load_font(size: int, bold: bool = False):
    for path in FONT_CANDIDATES:
        try:
            idx = 1 if (bold and path.endswith(".ttc")) else 0
            return ImageFont.truetype(path, size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()


def render(scale: int) -> Image.Image:
    w, h = W * scale, H * scale
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)

    head = Image.open(HEAD).convert("RGBA")
    hs = 40 * scale
    head = head.resize((hs, hs), Image.LANCZOS)
    img.paste(head, (40 * scale, 28 * scale), head)

    d.text((90 * scale, 34 * scale), "Beaver", font=load_font(24 * scale, bold=True), fill=FG)
    d.line([(40 * scale, 92 * scale), (w - 40 * scale, 92 * scale)], fill=DIVIDER, width=max(1, scale))

    ay = 210 * scale
    d.line([(250 * scale, ay), (408 * scale, ay)], fill=AMBER, width=3 * scale)
    d.polygon(
        [(408 * scale, ay - 8 * scale), (408 * scale, ay + 8 * scale), (426 * scale, ay)],
        fill=AMBER,
    )

    caption = "Drag Beaver into your Applications folder"
    font = load_font(14 * scale)
    tb = d.textbbox((0, 0), caption, font=font)
    d.text(((w - (tb[2] - tb[0])) // 2, 332 * scale), caption, font=font, fill=MUTED)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    render(1).save(OUT / "background.png")
    render(2).save(OUT / "background@2x.png")
    print(f"wrote {OUT/'background.png'} (660x420) and {OUT/'background@2x.png'} (1320x840)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Generate the assets**

Run: `/tmp/beaver-venv/bin/python scripts/gen-dmg-background.py`
Expected: prints the two output paths. (If `/tmp/beaver-venv` is gone: `python3 -m venv /tmp/beaver-venv && /tmp/beaver-venv/bin/pip install Pillow`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/tests/dmg-background.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-dmg-background.py src-tauri/dmg/background.png src-tauri/dmg/background@2x.png src/tests/dmg-background.test.ts
git commit -m "feat: add branded DMG installer background"
```

---

## Task 3: Rebrand app icon to the beaver head

> Asset/build step — verified by file output + visual check rather than a unit test (icon generation does not TDD cleanly). `pnpm tauri icon` regenerates every entry under `src-tauri/icons/` from a single 1024² source.

**Files:**
- Create: `scripts/gen-app-icon.py`
- Regenerate: `src-tauri/icons/*`

- [ ] **Step 1: Create the icon-source generator `scripts/gen-app-icon.py`**

```python
#!/usr/bin/env python3
"""Build a 1024x1024 macOS app-icon source: beaver head on a warm squircle."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
HEAD = ROOT / "Downloads"  # overridden below
SRC = Path.home() / "Downloads" / "beaver_head_transparent_app_icon.png"

SIZE = 1024
RADIUS = 229            # ~0.2237 * 1024, the macOS squircle corner radius
TOP = (251, 234, 203)   # warm cream
BOT = (224, 164, 90)    # amber


def gradient(size: int, top, bot) -> Image.Image:
    g = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        g.putpixel((0, y), tuple(round(top[i] * (1 - t) + bot[i] * t) for i in range(3)))
    return g.resize((size, size))


def rounded_mask(size: int, radius: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def main(out_path: str) -> None:
    base = gradient(SIZE, TOP, BOT)
    base.putalpha(rounded_mask(SIZE, RADIUS))

    head = Image.open(SRC).convert("RGBA")
    bbox = head.getbbox()
    head = head.crop(bbox)
    target = int(SIZE * 0.62)
    ratio = target / max(head.size)
    head = head.resize((round(head.width * ratio), round(head.height * ratio)), Image.LANCZOS)
    x = (SIZE - head.width) // 2
    y = (SIZE - head.height) // 2 - int(SIZE * 0.02)
    base.alpha_composite(head, (x, y))

    base.save(out_path)
    print(f"wrote {out_path} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/beaver-icon-source.png")
```

- [ ] **Step 2: Generate the 1024 source**

Run: `/tmp/beaver-venv/bin/python scripts/gen-app-icon.py /tmp/beaver-icon-source.png`
Expected: prints `wrote /tmp/beaver-icon-source.png (1024x1024)`.

- [ ] **Step 3: Regenerate all icons**

Run: `pnpm tauri icon /tmp/beaver-icon-source.png`
Expected: Tauri writes `icon.icns`, `icon.ico`, `32x32.png`, `128x128.png`, `128x128@2x.png`, and the Square*Logo PNGs into `src-tauri/icons/`.

- [ ] **Step 4: Visual check**

Open `src-tauri/icons/128x128.png` (or screenshot it) and confirm it shows the beaver head on the warm squircle, no clipping. Adjust `target`/`y` offset in the generator and re-run if cramped.

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-app-icon.py src-tauri/icons
git commit -m "feat: rebrand app icon to the beaver head"
```

---

## Task 4: Release script + credentials + wiring

**Files:**
- Test: `src/tests/release-script.test.ts` (create)
- Create: `scripts/release-macos.sh`, `.env.release.example`
- Modify: `.gitignore`, `package.json`

- [ ] **Step 1: Write the failing test**

Create `src/tests/release-script.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function printMode(identity: string): string {
  return execFileSync("bash", ["scripts/release-macos.sh", "--print-mode"], {
    encoding: "utf8",
    env: { ...process.env, APPLE_SIGNING_IDENTITY: identity },
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
    const ex = readFileSync(".env.release.example", "utf8");
    expect(ex).toContain("APPLE_SIGNING_IDENTITY");
    expect(ex).toContain("APPLE_TEAM_ID");
  });

  it("gitignores the real .env.release", () => {
    expect(readFileSync(".gitignore", "utf8")).toContain(".env.release");
  });

  it("exposes a release:mac script", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["release:mac"]).toContain("release-macos.sh");
  });

  it("keeps the example but never the real secrets file", () => {
    expect(existsSync(".env.release.example")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/tests/release-script.test.ts`
Expected: FAIL — script and files do not exist.

- [ ] **Step 3: Create `scripts/release-macos.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load gitignored release credentials if present.
if [[ -f .env.release ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.release
  set +a
fi

print_mode() {
  if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then echo "signed"; else echo "unsigned"; fi
}

if [[ "${1:-}" == "--print-mode" ]]; then
  print_mode
  exit 0
fi

MODE="$(print_mode)"
echo "==> Beaver release (mode: ${MODE}, target: aarch64-apple-darwin)"
if [[ "$MODE" == "unsigned" ]]; then
  echo "!!  No APPLE_SIGNING_IDENTITY — building an UNSIGNED DMG."
  echo "!!  First launch needs right-click > Open. Add creds to .env.release to notarize."
fi

pnpm tauri build --target aarch64-apple-darwin

BUNDLE="src-tauri/target/aarch64-apple-darwin/release/bundle"
APP="$(/usr/bin/find "$BUNDLE/macos" -maxdepth 1 -name '*.app' 2>/dev/null | head -1)"
DMG="$(/usr/bin/find "$BUNDLE/dmg" -maxdepth 1 -name '*.dmg' 2>/dev/null | head -1)"

if [[ "$MODE" == "signed" ]]; then
  echo "==> Verifying signature, Gatekeeper, and notarization staple"
  codesign --verify --deep --strict --verbose=2 "$APP"
  spctl -a -t exec -vvv "$APP"
  xcrun stapler validate "$DMG"
fi

echo "==> Done (${MODE}). DMG: ${DMG:-<none>}"
```

Then `chmod +x scripts/release-macos.sh`.

- [ ] **Step 4: Create `.env.release.example`**

```bash
# Copy to .env.release (gitignored) and fill in to produce a signed, notarized DMG.
# Leave this file blank/unset to build an UNSIGNED DMG for local testing.

# Developer ID Application identity, exactly as shown by:
#   security find-identity -v -p codesigning
# e.g. "Developer ID Application: DJTL AB (Z7HLVJ93DA)"
APPLE_SIGNING_IDENTITY=

# --- Notarization: choose ONE method ---

# Method A — Apple ID + app-specific password (appleid.apple.com > App-Specific Passwords)
APPLE_ID=
APPLE_PASSWORD=
APPLE_TEAM_ID=Z7HLVJ93DA

# Method B — App Store Connect API key (.p8). Comment out Method A if you use this.
# APPLE_API_ISSUER=
# APPLE_API_KEY=
# APPLE_API_KEY_PATH=
```

- [ ] **Step 5: Add `.env.release` to `.gitignore`**

Append to `.gitignore`:

```
# Release credentials (never commit real secrets)
.env.release
```

- [ ] **Step 6: Add the `release:mac` script to `package.json`**

In the `"scripts"` object add:

```json
    "release:mac": "bash scripts/release-macos.sh"
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm exec vitest run src/tests/release-script.test.ts`
Expected: PASS (6/6).

- [ ] **Step 8: Commit**

```bash
git add scripts/release-macos.sh .env.release.example .gitignore package.json src/tests/release-script.test.ts
git commit -m "feat: add two-mode macOS release script with notarization wiring"
```

---

## Task 5: README install/build docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an "Install" and "Building a release" section to `README.md`**

```markdown
## Install (macOS, Apple Silicon)

1. Download `Beaver_<version>_aarch64.dmg`.
2. Open the DMG and drag **Beaver** into **Applications**.
3. Launch Beaver from Applications. Grant Screen Recording permission when asked.

> Unsigned builds: the first launch needs right-click → **Open** (one time) to get
> past Gatekeeper. Signed/notarized builds open normally.

## Building a release

Requires Apple Silicon, Rust, and pnpm.

```bash
pnpm release:mac
```

Without credentials this produces an **unsigned** DMG for local testing. To sign
and notarize, copy `.env.release.example` to `.env.release`, fill in your Developer
ID identity and notarization credentials, and re-run. The script verifies the
signature, Gatekeeper acceptance, and notarization staple before finishing.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document DMG install and release build"
```

---

## Task 6: Acceptance — build the unsigned DMG

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite + typecheck**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 2: Build the unsigned DMG (long-running)**

Run: `pnpm release:mac`
Expected: ends with `==> Done (unsigned). DMG: src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Beaver_0.1.0_aarch64.dmg`.

- [ ] **Step 3: Verify the artifact exists and is well-formed**

Run: `ls -lh src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg && hdiutil imageinfo src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg | head`
Expected: a non-trivial `.dmg` file; `hdiutil` reports a valid image.

- [ ] **Step 4: Manual visual check (mount the DMG)**

Run: `open src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg`
Confirm the window shows the branded background, Beaver icon (left), Applications (right), and arrow.

- [ ] **Step 5: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage:**
- Apple Silicon target + min version → Task 1 (config) + Task 6 (build flag). ✓
- DMG layout/background → Task 1 (positions) + Task 2 (background). ✓
- App icon rebrand → Task 3. ✓
- Two-mode signing/notarization + verification → Task 4 (script) + Task 6 (acceptance). ✓
- Credentials handling (example + gitignore) → Task 4. ✓
- Install docs → Task 5. ✓
- Non-goals (auto-update, CI, universal, hosting, tray) → not in any task. ✓

**Placeholder scan:** none — every code/asset/command step has concrete content.

**Type/name consistency:** `dmg/background.png` path, window 660×420, positions (180,210)/(480,210), and the `print_mode` ⇒ `signed`/`unsigned` contract are identical across the config, generator, script, and tests.
