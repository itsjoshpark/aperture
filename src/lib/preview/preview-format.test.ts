import { describe, expect, it } from "vite-plus/test";
import { MAX_PREVIEW_EDGE, previewSize } from "./preview-format";

describe("previewSize", () => {
  it("leaves anything already small enough alone", () => {
    expect(previewSize(64, 64)).toEqual({ width: 64, height: 64 });
    expect(previewSize(2048, 1200)).toEqual({ width: 2048, height: 1200 });
  });

  // The shape a 12 MP iPhone photo actually arrives in, either way up.
  it("fits a landscape photo to the long edge", () => {
    expect(previewSize(4032, 3024)).toEqual({ width: 2048, height: 1536 });
  });

  it("fits a portrait photo to the long edge", () => {
    expect(previewSize(3024, 4032)).toEqual({ width: 1536, height: 2048 });
  });

  it("keeps a panorama's short edge from rounding away to nothing", () => {
    const { width, height } = previewSize(20000, 500);
    expect(width).toBe(MAX_PREVIEW_EDGE);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("never upscales", () => {
    expect(previewSize(10, 4)).toEqual({ width: 10, height: 4 });
  });
});
