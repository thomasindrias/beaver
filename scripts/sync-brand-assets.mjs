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
