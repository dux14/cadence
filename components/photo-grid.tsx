"use client";

import { useMemo, useState } from "react";
import type { Photo } from "@/lib/types";
import { useObjectUrls } from "@/lib/image/object-url";
import { PhotoViewer } from "./photo-viewer";

export function PhotoGrid({ photos }: { photos: Photo[] }) {
  const thumbs = useMemo(() => photos.map((p) => p.thumb), [photos]);
  const urls = useObjectUrls(thumbs);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="mt-4 grid grid-cols-4 gap-1.5">
        {photos.map((p, i) => (
          <button
            key={p.guid}
            type="button"
            onClick={() => setViewerIndex(i)}
            className="aspect-square overflow-hidden rounded-lg border border-border bg-border/30"
            aria-label={`Open photo ${i + 1}`}
          >
            {urls[i] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[i]}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </button>
        ))}
      </div>
      {viewerIndex !== null && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}
