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
