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

  it("respects EXIF orientation via imageOrientation parameter", async () => {
    const close = vi.fn();
    const createImageBitmapMock = vi.fn(async () => ({ width: 3200, height: 1600, close }) as unknown as ImageBitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);
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

    await compressImage(new Blob(["src"], { type: "image/png" }));

    expect(createImageBitmapMock).toHaveBeenCalledWith(
      expect.any(Blob),
      { imageOrientation: "from-image" }
    );

    vi.unstubAllGlobals();
  });

  it("falls back to document.createElement canvas when OffscreenCanvas is unavailable", async () => {
    const close = vi.fn();
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 3200, height: 1600, close }) as unknown as ImageBitmap),
    );

    const drawImage = vi.fn();
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      cb(new Blob(["webp"], { type: "image/webp" }));
    });
    const getContext = vi.fn(() => ({ drawImage }) as unknown as CanvasRenderingContext2D);

    const canvasElement = {
      width: 0,
      height: 0,
      getContext,
      toBlob,
    } as unknown as HTMLCanvasElement;

    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvasElement),
    } as unknown as Document);

    const result = await compressImage(new Blob(["src"], { type: "image/png" }));

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.thumb).toBeInstanceOf(Blob);
    expect(toBlob).toHaveBeenCalledTimes(2); // full + thumb

    vi.unstubAllGlobals();
  });

  it("falls back to JPEG on the <canvas> path when WebP isn't encodable (iOS Safari)", async () => {
    const close = vi.fn();
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 3200, height: 1600, close }) as unknown as ImageBitmap),
    );

    const drawImage = vi.fn();
    // iOS Safari ignores "image/webp" and yields PNG; the JPEG retry succeeds.
    const toBlob = vi.fn((cb: (b: Blob | null) => void, type: string) => {
      if (type === "image/webp") cb(new Blob(["png"], { type: "image/png" }));
      else cb(new Blob(["jpeg"], { type: "image/jpeg" }));
    });
    const getContext = vi.fn(() => ({ drawImage }) as unknown as CanvasRenderingContext2D);

    const canvasElement = {
      width: 0,
      height: 0,
      getContext,
      toBlob,
    } as unknown as HTMLCanvasElement;

    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvasElement),
    } as unknown as Document);

    const result = await compressImage(new Blob(["src"], { type: "image/png" }));

    expect(result.blob.type).toBe("image/jpeg");
    expect(result.thumb.type).toBe("image/jpeg");
    // 2 renders × (webp attempt + jpeg retry) = 4 calls.
    expect(toBlob).toHaveBeenCalledTimes(4);

    vi.unstubAllGlobals();
  });

  it("falls back to JPEG on the OffscreenCanvas path when WebP isn't encodable", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 3200, height: 1600, close }) as unknown as ImageBitmap),
    );
    const drawImage = vi.fn();
    const convertToBlob = vi.fn(async ({ type }: { type: string }) =>
      type === "image/webp"
        ? new Blob(["png"], { type: "image/png" })
        : new Blob(["jpeg"], { type: "image/jpeg" }),
    );
    class FakeOffscreen {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { drawImage } as unknown as OffscreenCanvasRenderingContext2D;
      }
      convertToBlob = convertToBlob;
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreen as unknown as typeof OffscreenCanvas);

    const result = await compressImage(new Blob(["src"], { type: "image/png" }));

    expect(result.blob.type).toBe("image/jpeg");
    expect(result.thumb.type).toBe("image/jpeg");

    vi.unstubAllGlobals();
  });
});
