export interface Dimensions {
  width: number;
  height: number;
}

export interface CompressedImage {
  blob: Blob; // WebP where the canvas can encode it; JPEG fallback otherwise
  thumb: Blob;
  width: number;
  height: number;
}

export const MAX_SIDE = 1600;
export const THUMB_SIDE = 200;
export const QUALITY = 0.8;

// iOS Safari/WebKit decodes WebP but cannot ENCODE it via canvas (toBlob /
// convertToBlob ignore "image/webp" and yield PNG). So we prefer WebP for its
// smaller size and fall back to JPEG — universally encodable — instead of
// throwing. JPEG keeps every iPhone working; display reads blob.type, so the
// stored extension is irrelevant.

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
 * Draw a bitmap onto a canvas at the given size and encode it, preferring WebP
 * and falling back to JPEG where the canvas can't encode WebP (iOS Safari).
 * Impure: depends on OffscreenCanvas/createImageBitmap. Not run under jsdom.
 */
async function renderImage(
  bitmap: ImageBitmap,
  dims: Dimensions,
  quality: number,
): Promise<Blob> {
  // OffscreenCanvas where available (Chrome/Android/desktop); fall back to
  // a detached <canvas> for Safari, which lacks OffscreenCanvas on older iOS.
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(dims.width, dims.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, dims.width, dims.height);
    const webp = await canvas.convertToBlob({ type: "image/webp", quality });
    // WebKit ignores "image/webp" and returns PNG — re-encode as JPEG.
    if (webp.type === "image/webp") return webp;
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  const canvas = document.createElement("canvas");
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, dims.width, dims.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === "image/webp") {
          resolve(webp);
          return;
        }
        // iOS Safari: no WebP canvas encoder (it yields PNG or null) — JPEG is
        // universally encodable, so use it rather than failing the upload.
        canvas.toBlob(
          (jpeg) =>
            jpeg ? resolve(jpeg) : reject(new Error("toBlob returned null")),
          "image/jpeg",
          quality,
        );
      },
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
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const full = fitDimensions(bitmap.width, bitmap.height, MAX_SIDE);
    const thumbDims = fitDimensions(bitmap.width, bitmap.height, THUMB_SIDE);
    const [blob, thumb] = await Promise.all([
      renderImage(bitmap, full, QUALITY),
      renderImage(bitmap, thumbDims, QUALITY),
    ]);
    return { blob, thumb, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}
