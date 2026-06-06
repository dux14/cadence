import { describe, expect, it, vi } from "vitest";
import { compressImage, fitDimensions } from "@/lib/image/compress";

describe("fitDimensions", () => {
  it("leaves images smaller than max untouched", () => {
    expect(fitDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("scales a landscape image so the longer side equals max", () => {
    expect(fitDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it("scales a portrait image so the longer side equals max", () => {
    expect(fitDimensions(1600, 3200, 1600)).toEqual({ width: 800, height: 1600 });
  });

  it("rounds to integer pixels", () => {
    const { width, height } = fitDimensions(1000, 333, 200);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
    expect(width).toBe(200);
    expect(height).toBe(67);
  });

  it("handles square images", () => {
    expect(fitDimensions(2000, 2000, 200)).toEqual({ width: 200, height: 200 });
  });
});

describe("compressImage (mocked canvas)", () => {
  it("produces a main blob and a thumb, using fitDimensions for sizing", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 3200, height: 1600, close }) as unknown as ImageBitmap),
    );
    const convertToBlob = vi.fn(async () => new Blob(["webp"], { type: "image/webp" }));
    const drawImage = vi.fn();
    class FakeOffscreen {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { drawImage } as unknown as OffscreenCanvasRenderingContext2D;
      }
      convertToBlob = convertToBlob;
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreen as unknown as typeof OffscreenCanvas);

    const result = await compressImage(new Blob(["src"], { type: "image/png" }));

    expect(result.width).toBe(1600); // 3200 longer side -> 1600
    expect(result.height).toBe(800);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.thumb).toBeInstanceOf(Blob);
    expect(convertToBlob).toHaveBeenCalledTimes(2); // full + thumb
    expect(close).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });
});
