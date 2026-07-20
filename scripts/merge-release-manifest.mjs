#!/usr/bin/env node
// Merges per-architecture updater fragments (one per matrix leg, written by
// release-macos.sh) into the single latest.json the in-app updater consumes.
//
// Usage: merge-release-manifest.mjs <version> <artifacts-dir> <out-path>
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";

const [, , version, artifactsDir, outPath] = process.argv;
if (!version || !artifactsDir || !outPath) {
  console.error("usage: merge-release-manifest.mjs <version> <artifacts-dir> <out-path>");
  process.exit(1);
}

const platforms = {};
for (const entry of readdirSync(artifactsDir)) {
  if (!entry.startsWith("Beaver-macOS-Updater-")) continue;
  const fragmentPath = `${artifactsDir}/${entry}/latest-fragment.json`;
  if (!existsSync(fragmentPath)) continue;
  Object.assign(platforms, JSON.parse(readFileSync(fragmentPath, "utf8")));
}

if (Object.keys(platforms).length === 0) {
  console.error(`no updater fragments found under ${artifactsDir}`);
  process.exit(1);
}

writeFileSync(
  outPath,
  JSON.stringify({ version, pub_date: new Date().toISOString(), platforms }, null, 2) + "\n"
);
