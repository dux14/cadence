"use client";

import { useEffect, useMemo, useState } from "react";
import type { Photo } from "@/lib/types";
import { useObjectUrls } from "@/lib/image/object-url";
import { ensurePhotoBlob } from "@/lib/sync/orchestrator";
import { PhotoViewer } from "./photo-viewer";

export function PhotoGrid({ photos }: { photos: Photo[] }) {
  // Photos synced from another device arrive as metadata only (no thumb), so
  // fall back to the full blob for the grid cell once it's downloaded.
  const thumbs = useMemo(() => photos.map((p) => p.thumb ?? p.blob), [photos]);
  const urls = useObjectUrls(thumbs);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Fetch the binary for any remote-only photo so the cell can render. The
  // download writes into IndexedDB, which re-fires the parent's live query.
  const missing = photos.filter((p) => !p.blob).map((p) => p.guid).join(",");
  useEffect(() => {
    if (!missing) return;
    for (const guid of missing.split(",")) void ensurePhotoBlob(guid);
  }, [missing]);

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
