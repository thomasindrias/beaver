export const beaverProduct = {
  name: "Beaver",
  tagline: "Screenshot to structured Markdown, fully on-device.",
  platform: "macOS",
} as const;

export const brandAssets = {
  head: "/beaver-head.webp",
  favicon: "/favicon.ico",
  wave: "/beaver-wave.mp4",
} as const;

export type BrandAssetName = keyof typeof brandAssets;
