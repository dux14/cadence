"use client";

import { useEffect, useState } from "react";

/**
 * Create object URLs for a list of blobs and revoke them on change/unmount.
 * Returns URLs aligned by index with `blobs`. Revoking is the whole point:
 * un-revoked object URLs leak until the document is discarded.
 */
export function useObjectUrls(blobs: Blob[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const created = blobs.map((b) => URL.createObjectURL(b));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrls(created);
    return () => {
      for (const u of created) URL.revokeObjectURL(u);
    };
    // Re-run when the set of blobs changes identity/length.
  }, [blobs]);

  return urls;
}
