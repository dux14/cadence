export interface Dimensions {
  width: number;
  height: number;
}

export interface CompressedImage {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export const MAX_SIDE = 1600;
export const THUMB_SIDE = 200;
export const QUALITY = 0.8;

/**
 * Pure resize math: scale (w,h) so the longer side is at most `max`,
 * preserving aspect ratio. Never upscales. Rounds to whole pixels.
 */
export function fitDimensions(w: number, h: number, max: number): Dimensions {
  const longest = Math.max(w, h);
  if (longest <= max) return { width: Math.round(w), height: Math.round(h) };
  const scale = max / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/**
 * Draw a bitmap onto an offscreen canvas at the given size and encode WebP.
 * Impure: depends on OffscreenCanvas/createImageBitmap. Not run under jsdom.
 */
async function renderWebp(
  bitmap: ImageBitmap,
  dims: Dimensions,
  quality: number,
): Promise<Blob> {
  // OffscreenCanvas where available (Chrome/Android/desktop); fall back to
  // a detached <canvas> for Safari, which lacks convertToBlob.
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(dims.width, dims.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, dims.width, dims.height);
    return canvas.convertToBlob({ type: "image/webp", quality });
  }
  const canvas = document.createElement("canvas");
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, dims.width, dims.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/webp",
      quality,
    );
  });
}

/**
 * Compress a user-supplied image file into a WebP main blob (longer side
 * <= MAX_SIDE, q~0.8) plus a WebP thumbnail (longer side ~THUMB_SIDE).
 * Impure: depends on createImageBitmap. Verify manually (see plan Task 9).
 */
export async function compressImage(file: Blob): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const full = fitDimensions(bitmap.width, bitmap.height, MAX_SIDE);
    const thumbDims = fitDimensions(bitmap.width, bitmap.height, THUMB_SIDE);
    const [blob, thumb] = await Promise.all([
      renderWebp(bitmap, full, QUALITY),
      renderWebp(bitmap, thumbDims, QUALITY),
    ]);
    return { blob, thumb, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}
