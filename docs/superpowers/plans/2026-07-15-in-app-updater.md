# In-App Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click in-app updates: the existing `UpdatePill` gains a download-and-restart flow via `tauri-plugin-updater`, fed by signed updater artifacts (`.app.tar.gz` + `latest.json`) that the release pipeline publishes alongside the DMG.

**Architecture:** The existing passive daily check (`src-tauri/src/update.rs`, 24 h cache against the GitHub Releases API) stays exactly as-is — it only decides whether the pill is visible. Clicking the pill runs the updater plugin's `check()` against a `latest.json` manifest on the newest GitHub release, then `downloadAndInstall()` (signature-verified against a public key baked into `tauri.conf.json`) and `relaunch()`. If no manifest exists (older releases, unsigned/local builds) or anything fails, the pill falls back to today's behavior: open the release page. The release script builds the updater tarball **after** Apple codesigning/notarization so the shipped bytes are the signed app, and signs it with a separate minisign updater key.

**Tech Stack:** Tauri 2 (`tauri-plugin-updater` 2.x, `tauri-plugin-process` 2.x), `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` (npm), minisign keys via `tauri signer`, bash release script, GitHub Actions, vitest.

## Global Constraints

- **Allowed new dependencies (exactly four, nothing else):** Rust crates `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"`; npm packages `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`.
- Do not modify `src-tauri/src/update.rs` or `src-tauri/resources/mlx_server.py`.
- The CSP in `tauri.conf.json` must remain byte-identical (updater networking happens in Rust, not the webview) — `src/tests/tauri-config.test.ts` already pins it.
- Updater endpoint is exactly one URL: `https://github.com/thomasindrias/beaver/releases/latest/download/latest.json`.
- `BEAVER_DISABLE_UPDATE_CHECK=1` must still suppress the entire flow (it already gates `check_for_update`, which gates pill visibility — no new code path may check for updates when the pill is hidden).
- The **private** updater key must never enter the repository. It lives at `~/.tauri/beaver-updater.key` locally and in GitHub secrets. Any task step that would `git add` it is a bug.
- Pill copy (exact): idle `Update to v{version}`, downloading `Downloading… {percent}%`, ready `Restart to update`.
- Frontend tests: `pnpm test:run`. Rust: `cargo test` inside `src-tauri/`. Commit after every task, conventional commits, trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Manual Maintainer Steps (after the code merges — not agent work)

1. Add GitHub Actions secrets: `TAURI_SIGNING_PRIVATE_KEY` (contents of `~/.tauri/beaver-updater.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty string — the key is generated passwordless).
2. Add the same two variables to local `.env.release` (the example file documents them after Task 4).
3. Dry run before trusting it: publish a throwaway `v0.1.1` release with updater assets, install the current `v0.1.0` DMG, and confirm the pill downloads, restarts, and lands on `v0.1.1`. The updater only proves itself end-to-end.

## File Structure

| File | Responsibility |
|---|---|
| `src-tauri/tauri.conf.json` (modify) | `plugins.updater` block: pubkey + single endpoint |
| `src-tauri/capabilities/default.json` (modify) | `updater:default`, `process:allow-restart` permissions |
| `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` (modify) | Register the two plugins on the builder |
| `package.json` (modify) | The two npm plugin packages |
| `src/components/UpdatePill.tsx` (modify) | idle → downloading → restart flow with release-page fallback |
| `scripts/release-macos.sh` (modify) | Staple the loose .app; build + sign `.app.tar.gz`; emit `latest.json` (gated on `TAURI_SIGNING_PRIVATE_KEY`) |
| `.github/workflows/release-macos.yml` (modify) | Pass secrets/tag through; upload updater assets to the release |
| `.env.release.example` (modify) | Document the two updater-key variables |
| `README.md`, `SECURITY.md`, `CHANGELOG.md` (modify) | Network-behavior + verification story |
| Tests: `src/tests/tauri-config.test.ts`, `src/tests/UpdatePill.test.tsx`, `src/tests/release-script.test.ts` (modify) | Config pins, pill flow, pipeline wiring |

---

### Task 1: Updater key, config, and capabilities

**Files:**
- Modify: `src-tauri/tauri.conf.json` (the empty `"plugins": {}` at the end)
- Modify: `src-tauri/capabilities/default.json`
- Test: `src/tests/tauri-config.test.ts`

**Interfaces:**
- Produces: `plugins.updater.pubkey` (minisign public key string) and `plugins.updater.endpoints = ["https://github.com/thomasindrias/beaver/releases/latest/download/latest.json"]` — Task 2's plugin reads this config at startup; Task 4 signs with the matching private key at `~/.tauri/beaver-updater.key`.

- [ ] **Step 1: Generate the updater keypair** (skip if `~/.tauri/beaver-updater.key` already exists — never overwrite):

```bash
test -f ~/.tauri/beaver-updater.key || pnpm tauri signer generate -w ~/.tauri/beaver-updater.key --password ""
cat ~/.tauri/beaver-updater.key.pub
```

Copy the printed public key — it goes into the config in Step 4. Verify `git status` shows no key files (they live under `~`, outside the repo).

- [ ] **Step 2: Write the failing config tests** — append to `src/tests/tauri-config.test.ts` (and add `const caps = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));` below the existing `conf` line):

```ts
describe("updater config", () => {
  it("pins the single GitHub latest.json endpoint", () => {
    expect(conf.plugins.updater.endpoints).toEqual([
      "https://github.com/thomasindrias/beaver/releases/latest/download/latest.json",
    ]);
  });

  it("embeds a non-empty updater public key", () => {
    expect(typeof conf.plugins.updater.pubkey).toBe("string");
    expect(conf.plugins.updater.pubkey.length).toBeGreaterThan(0);
  });

  it("grants exactly the updater and restart permissions", () => {
    expect(caps.permissions).toContain("updater:default");
    expect(caps.permissions).toContain("process:allow-restart");
    expect(caps.permissions).not.toContain("process:default");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test:run src/tests/tauri-config.test.ts`
Expected: FAIL — `conf.plugins.updater` is undefined.

- [ ] **Step 4: Implement** — in `src-tauri/tauri.conf.json`, replace `"plugins": {}` with (paste the real pubkey from Step 1):

```json
  "plugins": {
    "updater": {
      "pubkey": "<PASTE ~/.tauri/beaver-updater.key.pub CONTENTS HERE>",
      "endpoints": [
        "https://github.com/thomasindrias/beaver/releases/latest/download/latest.json"
      ]
    }
  }
```

In `src-tauri/capabilities/default.json`, append to the `permissions` array:

```json
    "updater:default",
    "process:allow-restart"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:run src/tests/tauri-config.test.ts`
Expected: all PASS, including the pre-existing CSP pin (unchanged CSP is part of this task's contract).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json src/tests/tauri-config.test.ts
git commit -m "feat: updater endpoint, public key, and capability grants"
```

---

### Task 2: Register the updater and process plugins in Rust

**Files:**
- Modify: `src-tauri/Cargo.toml` (the `[dependencies]` table)
- Modify: `src-tauri/src/lib.rs` (the `tauri::Builder::default()` chain — find it with `grep -n "tauri::Builder::default" src-tauri/src/lib.rs`, then locate the existing `.plugin(` lines nearby)

**Interfaces:**
- Consumes: `plugins.updater` config from Task 1 (the updater plugin reads it at startup).
- Produces: the runtime capability Task 3's JS calls (`check()`, `downloadAndInstall()`, `relaunch()`) rely on.

- [ ] **Step 1: Add the crates** — in `src-tauri/Cargo.toml` under `[dependencies]`, next to the existing `tauri-plugin-*` entries:

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

- [ ] **Step 2: Register the plugins** — in `src-tauri/src/lib.rs`, add these two lines to the builder chain directly after the last existing `.plugin(...)` registration:

```rust
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
```

- [ ] **Step 3: Verify it compiles and all tests pass**

Run: `cd src-tauri && cargo test`
Expected: compiles clean (first run downloads the new crates), all existing tests PASS, zero warnings. There is no unit test for plugin registration itself — the compile plus Task 1's config tests are the gate, and Task 3's frontend tests exercise the JS surface.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs
git commit -m "feat: register updater and process plugins"
```

---

### Task 3: UpdatePill download-and-restart flow

**Files:**
- Modify: `package.json` (via `pnpm add`)
- Modify: `src/components/UpdatePill.tsx`
- Test: `src/tests/UpdatePill.test.tsx`

**Interfaces:**
- Consumes: `check()` from `@tauri-apps/plugin-updater` (returns `Update | null`; `update.downloadAndInstall(cb)` streams `Started {contentLength} / Progress {chunkLength} / Finished` events), `relaunch()` from `@tauri-apps/plugin-process`, existing Tauri commands `check_for_update` and `open_external`.
- Produces: the shipped pill. Phases: `idle` (`Update to v{version}`) → click → `downloading` (`Downloading… {percent}%`) → `ready` (`Restart to update`) → click → relaunch. Any failure (no manifest, download error) falls back to `open_external` with the release-page URL from the passive check.

- [ ] **Step 1: Install the JS plugins**

```bash
pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

- [ ] **Step 2: Rewrite the test file** — replace `src/tests/UpdatePill.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

type FocusHandler = (event: { payload: boolean }) => void;

const { invokeMock, focusHandlers, checkMock, relaunchMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  focusHandlers: [] as FocusHandler[],
  checkMock: vi.fn(),
  relaunchMock: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: checkMock }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: relaunchMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: (handler: FocusHandler) => {
      focusHandlers.push(handler);
      return Promise.resolve(() => {
        const i = focusHandlers.indexOf(handler);
        if (i >= 0) focusHandlers.splice(i, 1);
      });
    },
  }),
}));

function emitFocus(focused: boolean) {
  focusHandlers.forEach(h => h({ payload: focused }));
}

import { UpdatePill } from "../components/UpdatePill";

const RELEASE_URL = "https://github.com/thomasindrias/beaver/releases/tag/v0.2.0";

function mockUpdateAvailable() {
  invokeMock.mockImplementation(async (cmd: string) =>
    cmd === "check_for_update" ? { version: "0.2.0", url: RELEASE_URL } : undefined
  );
}

describe("UpdatePill visibility (passive check)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    checkMock.mockReset();
    relaunchMock.mockReset();
    focusHandlers.length = 0;
  });

  it("renders nothing when up to date", async () => {
    invokeMock.mockResolvedValue(null);
    const { container } = render(<UpdatePill />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("check_for_update"));
    expect(container).toBeEmptyDOMElement();
  });

  it("re-checks for an update every time the window regains focus", async () => {
    invokeMock.mockResolvedValue(null);
    render(<UpdatePill />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("check_for_update"));
    expect(invokeMock).toHaveBeenCalledTimes(1);

    emitFocus(true);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock).toHaveBeenLastCalledWith("check_for_update");
  });

  it("does not re-check when the window loses focus", async () => {
    invokeMock.mockResolvedValue(null);
    render(<UpdatePill />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("check_for_update"));
    invokeMock.mockClear();

    emitFocus(false);
    await new Promise(r => setTimeout(r, 10));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("stops listening for focus changes after unmount", async () => {
    invokeMock.mockResolvedValue(null);
    const { unmount } = render(<UpdatePill />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("check_for_update"));
    expect(focusHandlers).toHaveLength(1);

    unmount();
    await waitFor(() => expect(focusHandlers).toHaveLength(0));
  });
});

describe("UpdatePill one-click update", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    checkMock.mockReset();
    relaunchMock.mockReset();
    focusHandlers.length = 0;
    mockUpdateAvailable();
  });

  it("downloads with progress and offers a restart", async () => {
    checkMock.mockResolvedValue({
      downloadAndInstall: async (cb: (e: unknown) => void) => {
        cb({ event: "Started", data: { contentLength: 200 } });
        cb({ event: "Progress", data: { chunkLength: 100 } });
        cb({ event: "Finished" });
      },
    });
    render(<UpdatePill />);

    fireEvent.click(await screen.findByRole("button", { name: "Update to v0.2.0" }));

    expect(await screen.findByRole("button", { name: "Restart to update" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart to update" }));
    await waitFor(() => expect(relaunchMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).not.toHaveBeenCalledWith("open_external", expect.anything());
  });

  it("shows download progress as a percentage", async () => {
    let emit: ((e: unknown) => void) | null = null;
    let finish: (() => void) | null = null;
    checkMock.mockResolvedValue({
      downloadAndInstall: (cb: (e: unknown) => void) =>
        new Promise<void>(resolve => {
          emit = cb;
          finish = resolve;
        }),
    });
    render(<UpdatePill />);

    fireEvent.click(await screen.findByRole("button", { name: "Update to v0.2.0" }));
    await waitFor(() => expect(emit).not.toBeNull());
    emit!({ event: "Started", data: { contentLength: 200 } });
    emit!({ event: "Progress", data: { chunkLength: 100 } });

    expect(await screen.findByText("Downloading… 50%")).toBeInTheDocument();
    finish!();
  });

  it("falls back to the release page when no updater manifest exists", async () => {
    checkMock.mockResolvedValue(null);
    render(<UpdatePill />);

    fireEvent.click(await screen.findByRole("button", { name: "Update to v0.2.0" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_external", { url: RELEASE_URL })
    );
    expect(screen.getByRole("button", { name: "Update to v0.2.0" })).toBeInTheDocument();
  });

  it("falls back to the release page when the download fails", async () => {
    checkMock.mockResolvedValue({
      downloadAndInstall: async () => {
        throw new Error("network");
      },
    });
    render(<UpdatePill />);

    fireEvent.click(await screen.findByRole("button", { name: "Update to v0.2.0" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_external", { url: RELEASE_URL })
    );
  });
});
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `pnpm test:run src/tests/UpdatePill.test.tsx`
Expected: the four "one-click update" tests FAIL (pill still says "v0.2.0 available" and opens the URL directly); the visibility tests pass.

- [ ] **Step 4: Rewrite the component** — replace `src/components/UpdatePill.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateInfo {
  version: string;
  url: string;
}

type Phase = "idle" | "downloading" | "ready";

// Small header pill when a newer release exists. Visibility still comes from
// the passive daily check (Rust side, 24h cache). Clicking now performs the
// update in place via the updater plugin; if the release carries no updater
// manifest (older releases, unsigned/local builds) or anything fails, we fall
// back to opening the release page — the pill always leads somewhere.
export function UpdatePill() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const checkPassive = () => {
      invoke<UpdateInfo | null>("check_for_update")
        .then(setUpdate)
        .catch(() => {});
    };

    checkPassive();

    // The popover window is hidden/shown for the app's whole lifetime rather
    // than recreated, so a mount-only check would never fire again. Re-check
    // on every focus; the 24h cache on the Rust side keeps the network call
    // itself throttled.
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) checkPassive();
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const startUpdate = async () => {
    if (!update || phase !== "idle") return;
    try {
      const u = await check();
      if (!u) throw new Error("no updater manifest on the latest release");
      setPhase("downloading");
      let total = 0;
      let received = 0;
      await u.downloadAndInstall(e => {
        if (e.event === "Started") {
          total = e.data.contentLength ?? 0;
        } else if (e.event === "Progress") {
          received += e.data.chunkLength;
          if (total > 0) setPercent(Math.min(100, Math.round((received / total) * 100)));
        }
      });
      setPhase("ready");
    } catch {
      setPhase("idle");
      setPercent(0);
      invoke("open_external", { url: update.url }).catch(console.error);
    }
  };

  if (!update) return null;

  const pillClass =
    "rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/25";

  if (phase === "downloading") {
    return (
      <span aria-busy="true" className={pillClass}>
        Downloading… {percent}%
      </span>
    );
  }

  if (phase === "ready") {
    return (
      <button onClick={() => relaunch().catch(console.error)} className={pillClass}>
        Restart to update
      </button>
    );
  }

  return (
    <button onClick={startUpdate} className={pillClass}>
      Update to v{update.version}
    </button>
  );
}
```

- [ ] **Step 5: Run the full suite**

Run: `pnpm test:run`
Expected: all PASS (any other test referencing the old "available" label must be updated to the new copy — search with `grep -rn "available" src/tests/`).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/UpdatePill.tsx src/tests/UpdatePill.test.tsx
git commit -m "feat: one-click update flow in the update pill"
```

---

### Task 4: Release script emits signed updater artifacts

**Files:**
- Modify: `scripts/release-macos.sh`
- Modify: `.env.release.example`
- Test: `src/tests/release-script.test.ts`

**Interfaces:**
- Consumes: the private key matching Task 1's pubkey, via env `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, empty for the passwordless key); optional `BEAVER_RELEASE_TAG` (defaults to `v${VERSION}`).
- Produces: `src-tauri/target/aarch64-apple-darwin/release/bundle/updater/` containing `Beaver_${VERSION}_aarch64.app.tar.gz`, its `.sig`, and `latest.json` — Task 5's workflow uploads these. `latest.json` shape (exact keys): `{ "version", "pub_date", "platforms": { "darwin-aarch64": { "signature", "url" } } }`.

- [ ] **Step 1: Write the failing wiring tests** — append to `src/tests/release-script.test.ts`:

```ts
describe("updater artifacts", () => {
  const sh = readFileSync("scripts/release-macos.sh", "utf8");

  it("gates updater artifacts on the signing key, not on Apple identity", () => {
    expect(sh).toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(sh).toContain("tauri signer sign");
  });

  it("tars the app only after Apple signing and stapling", () => {
    const stapleApp = sh.indexOf('stapler staple "$APP"');
    const tarball = sh.indexOf(".app.tar.gz");
    expect(stapleApp).toBeGreaterThan(-1);
    expect(tarball).toBeGreaterThan(stapleApp);
  });

  it("emits a latest.json manifest with the darwin-aarch64 platform", () => {
    expect(sh).toContain("latest.json");
    expect(sh).toContain("darwin-aarch64");
  });

  it("documents the updater key in .env.release.example", () => {
    const ex = readFileSync(".env.release.example", "utf8");
    expect(ex).toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(ex).toContain("TAURI_SIGNING_PRIVATE_KEY_PASSWORD");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/tests/release-script.test.ts`
Expected: the four new tests FAIL; existing ones pass.

- [ ] **Step 3: Implement the script changes** — in `scripts/release-macos.sh`:

(a) Inside the existing signed-mode notarization block, right after `xcrun stapler staple "$DMG"`, staple the loose app too (the tarball must carry the ticket so Gatekeeper accepts the swapped-in app offline):

```bash
  xcrun stapler staple "$APP"
```

(b) At the end of the file, replace the final `echo "==> Done ..."` line with:

```bash
# 4. Updater artifacts: tar.gz of the (signed, stapled) .app plus a minisign
#    signature and the latest.json manifest the in-app updater consumes.
#    Gated on the updater key — local test builds without it skip this and
#    ship a DMG only. The tarball is built AFTER codesigning/stapling so the
#    updater distributes exactly the bytes the DMG carries.
if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "==> Building updater artifacts"
  UPDATER_DIR="$BUNDLE/updater"
  mkdir -p "$UPDATER_DIR"
  TARBALL="$UPDATER_DIR/Beaver_${VERSION}_aarch64.app.tar.gz"
  rm -f "$TARBALL" "$TARBALL.sig" "$UPDATER_DIR/latest.json"
  tar -czf "$TARBALL" -C "$(dirname "$APP")" "$(basename "$APP")"

  pnpm tauri signer sign "$TARBALL" --password "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

  TAG="${BEAVER_RELEASE_TAG:-v${VERSION}}"
  ASSET_URL="https://github.com/thomasindrias/beaver/releases/download/${TAG}/$(basename "$TARBALL")"
  node -e '
    const fs = require("fs");
    const [version, sigPath, url, out] = process.argv.slice(1);
    fs.writeFileSync(out, JSON.stringify({
      version,
      pub_date: new Date().toISOString(),
      platforms: { "darwin-aarch64": { signature: fs.readFileSync(sigPath, "utf8").trim(), url } },
    }, null, 2) + "\n");
  ' "$VERSION" "$TARBALL.sig" "$ASSET_URL" "$UPDATER_DIR/latest.json"
  echo "==> Updater artifacts in $UPDATER_DIR"
fi

echo "==> Done (${MODE}). DMG: ${DMG}"
```

(`tauri signer sign` reads the private key from the `TAURI_SIGNING_PRIVATE_KEY` env var — content or path both work; `--password` is passed explicitly so CI never prompts.)

(c) Append to `.env.release.example`:

```bash
# In-app updater signing (minisign key generated with `pnpm tauri signer generate`).
# Content of ~/.tauri/beaver-updater.key; password is empty for a passwordless key.
TAURI_SIGNING_PRIVATE_KEY=
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
```

- [ ] **Step 4: Run tests to verify they pass, and lint the script**

Run: `pnpm test:run src/tests/release-script.test.ts && bash -n scripts/release-macos.sh`
Expected: all PASS; `bash -n` exits 0 (syntax only — the full release run is the maintainer's dry run).

- [ ] **Step 5: Commit**

```bash
git add scripts/release-macos.sh .env.release.example src/tests/release-script.test.ts
git commit -m "feat: release script emits signed updater tarball and latest.json"
```

---

### Task 5: Workflow uploads, docs, and full verification

**Files:**
- Modify: `.github/workflows/release-macos.yml`
- Modify: `README.md` (the "How it works" network paragraph, lines ~34-38), `SECURITY.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 4's `bundle/updater/` outputs and env contract (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `BEAVER_RELEASE_TAG`).
- Produces: GitHub releases carrying `*.app.tar.gz` + `latest.json` next to the DMG, which is what Task 1's endpoint URL resolves to.

- [ ] **Step 1: Wire the workflow** — in `.github/workflows/release-macos.yml`:

(a) Add to the job-level `env:` block:

```yaml
      TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
      BEAVER_RELEASE_TAG: ${{ inputs.tag_name }}
```

(b) After the "Upload DMG artifact" step, add:

```yaml
      - name: Upload updater artifacts
        if: env.TAURI_SIGNING_PRIVATE_KEY != ''
        uses: actions/upload-artifact@v4
        with:
          name: Beaver-macOS-Updater
          path: src-tauri/target/aarch64-apple-darwin/release/bundle/updater/*
          if-no-files-found: error
```

(c) Replace the release step's `run:` block with:

```yaml
        run: |
          DMG="$(find src-tauri/target/aarch64-apple-darwin/release/bundle/dmg -name '*.dmg' -print -quit)"
          UPDATER_DIR="src-tauri/target/aarch64-apple-darwin/release/bundle/updater"
          ASSETS=("$DMG")
          if [[ -f "$UPDATER_DIR/latest.json" ]]; then
            ASSETS+=("$UPDATER_DIR"/*.app.tar.gz "$UPDATER_DIR/latest.json")
          fi
          if gh release view "${{ inputs.tag_name }}" >/dev/null 2>&1; then
            gh release upload "${{ inputs.tag_name }}" "${ASSETS[@]}" --clobber
          else
            gh release create "${{ inputs.tag_name }}" "${ASSETS[@]}" --draft --title "${{ inputs.tag_name }}" --notes "Draft Beaver macOS release."
          fi
```

- [ ] **Step 2: Update the docs**

(a) `README.md` — replace the sentence about the once-a-day version check (in "How it works") with:

```markdown
The only later network calls are update-related and go exclusively to GitHub:
an optional once-a-day version check against GitHub Releases, and — only when
you click the update pill — downloading the new release from the same place.
Updates are verified against a public key baked into the app before install
(no capture data, ever). Set `BEAVER_DISABLE_UPDATE_CHECK=1` to turn all of it
off.
```

(b) `SECURITY.md` — add a short "Update integrity" bullet/paragraph in the app-security-model section:

```markdown
- **Update integrity:** in-app updates are downloaded only from this
  repository's GitHub Releases and verified with minisign (public key baked
  into the app via `tauri-plugin-updater`) before installation, in addition
  to Apple code signing and notarization of the app itself.
```

(c) `CHANGELOG.md` — under `## Unreleased` → `### Added`:

```markdown
- One-click in-app updates: the update pill now downloads, verifies, and
  installs new releases in place (restart to finish). Falls back to opening
  the release page when a release has no updater assets.
```

- [ ] **Step 3: Full verification**

```bash
pnpm test:run                       # all pass
cd src-tauri && cargo test && cd .. # all pass
pnpm build                          # clean type-check + bundle
bash -n scripts/release-macos.sh    # exit 0
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-macos.yml README.md SECURITY.md CHANGELOG.md
git commit -m "feat: publish updater assets from the release workflow, document update integrity"
```

---

## Self-Review Notes

- **Spec coverage:** signed artifacts + manifest → Task 4; pipeline publish → Task 5; button-first flow with progress + relaunch → Task 3; passive daily check retained untouched → architecture (update.rs is off-limits per Global Constraints); `BEAVER_DISABLE_UPDATE_CHECK` honored → unchanged gate in `check_for_update`, asserted by "renders nothing when up to date" continuing to pass; fallback for manifest-less releases → Task 3 tests 3–4; key hygiene → Task 1 Step 1 + Global Constraints; maintainer secrets + dry run → Manual Maintainer Steps.
- **Deliberate scope cuts (YAGNI):** no auto-download toggle (Phase 2 settings screen), no release-notes display in the pill, no Windows/Linux platforms in `latest.json`, no stray `.sig` upload (its content is embedded in `latest.json`; the file still lands in the CI artifact for debugging).
- **Type consistency:** `latest.json` keys in Task 4 match what `tauri-plugin-updater` expects (`version`, `pub_date`, `platforms.darwin-aarch64.{signature,url}`); env names match across script, example file, and workflow; pill copy strings match between component and tests.
- **Known risk, mitigated:** a release published *without* updater assets makes `releases/latest/download/latest.json` 404 — the plugin `check()` then rejects and the pill falls back to the release page, which is exactly the pre-this-feature behavior.
