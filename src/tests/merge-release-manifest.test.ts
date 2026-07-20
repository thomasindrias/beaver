import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("merge-release-manifest.mjs", () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), "beaver-merge-test-"));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("merges per-architecture fragments into one manifest", () => {
    const artifactsDir = join(scratch, "artifacts");
    mkdirSync(join(artifactsDir, "Beaver-macOS-Updater-aarch64-apple-darwin"), { recursive: true });
    mkdirSync(join(artifactsDir, "Beaver-macOS-Updater-x86_64-apple-darwin"), { recursive: true });
    writeFileSync(
      join(artifactsDir, "Beaver-macOS-Updater-aarch64-apple-darwin", "latest-fragment.json"),
      JSON.stringify({ "darwin-aarch64": { signature: "SIGA", url: "https://example.com/a.tar.gz" } })
    );
    writeFileSync(
      join(artifactsDir, "Beaver-macOS-Updater-x86_64-apple-darwin", "latest-fragment.json"),
      JSON.stringify({ "darwin-x86_64": { signature: "SIGB", url: "https://example.com/b.tar.gz" } })
    );
    const outPath = join(scratch, "latest.json");

    execFileSync("node", ["scripts/merge-release-manifest.mjs", "0.2.0", artifactsDir, outPath], {
      encoding: "utf8",
    });

    const manifest = JSON.parse(readFileSync(outPath, "utf8"));
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.platforms["darwin-aarch64"]).toEqual({
      signature: "SIGA",
      url: "https://example.com/a.tar.gz",
    });
    expect(manifest.platforms["darwin-x86_64"]).toEqual({
      signature: "SIGB",
      url: "https://example.com/b.tar.gz",
    });
    expect(typeof manifest.pub_date).toBe("string");
  });

  it("errors out when no fragments are found", () => {
    const artifactsDir = join(scratch, "empty-artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    const outPath = join(scratch, "latest.json");

    expect(() =>
      execFileSync("node", ["scripts/merge-release-manifest.mjs", "0.2.0", artifactsDir, outPath], {
        encoding: "utf8",
        stdio: "pipe",
      })
    ).toThrow();
  });
});
