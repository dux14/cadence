"use client";

import { useEffect, useMemo, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import type { Photo } from "@/lib/types";
import { useObjectUrls } from "@/lib/image/object-url";
import { tombstonePhoto } from "@/lib/db/photos";

export function PhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: Photo[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const blobs = useMemo(() => photos.map((p) => p.blob), [photos]);
  const urls = useObjectUrls(blobs);
  const touchX = useRef<number | null>(null);

  const count = photos.length;
  const go = (delta: number) => {
    if (count === 0) return;
    onIndexChange((index + delta + count) % count);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  async function remove() {
    const current = photos[index];
    await tombstonePhoto(current.id!);
    if (count <= 1) {
      onClose();
      return;
    }
    // Stay in range after removal; the live list will shrink on re-render.
    onIndexChange(Math.min(index, count - 2));
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/90" />
        <Dialog.Content
          className="fixed inset-0 z-[70] flex flex-col focus:outline-none"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            touchX.current = null;
          }}
        >
          <Dialog.Title className="sr-only">Photo viewer</Dialog.Title>
          <div className="flex items-center justify-between p-4 text-white">
            <span className="text-[13px] opacity-80">
              {index + 1} / {count}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void remove()}
                aria-label="Delete photo"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
              >
                <Trash2 size={18} />
              </button>
              <Dialog.Close
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
              >
                <X size={18} />
              </Dialog.Close>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {urls[index] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[index]}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            )}
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous photo"
                  className="absolute left-2 hidden h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:grid"
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next photo"
                  className="absolute right-2 hidden h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:grid"
                >
                  <ChevronRight size={22} />
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
