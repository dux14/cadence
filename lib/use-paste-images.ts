"use client";

import { useEffect } from "react";
import { compressImage, type CompressedImage } from "@/lib/image/compress";

/**
 * While `enabled`, intercept clipboard paste of images (screenshots, copied
 * pictures) and hand each compressed result to `onAttach`.
 */
export function usePasteImages(
  enabled: boolean,
  onAttach: (img: CompressedImage) => void | Promise<void>,
): void {
  useEffect(() => {
    if (!enabled) return;
    async function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      for (const f of files) {
        const img = await compressImage(f);
        await onAttach(img);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
