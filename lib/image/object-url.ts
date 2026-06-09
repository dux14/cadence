"use client";

import { useEffect, useState } from "react";

/**
 * Create object URLs for a list of blobs and revoke them on change/unmount.
 * Returns URLs aligned by index with `blobs`. Revoking is the whole point:
 * un-revoked object URLs leak until the document is discarded.
 *
 * Slots whose blob is missing (e.g. a photo synced from another device whose
 * binary hasn't been downloaded yet) map to "". Passing such a slot to
 * URL.createObjectURL throws and, with no error boundary above, crashes the
 * whole page — so we skip them and only revoke the URLs we actually created.
 */
export function useObjectUrls(blobs: (Blob | null | undefined)[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const created = blobs.map((b) => (b ? URL.createObjectURL(b) : ""));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrls(created);
    return () => {
      for (const u of created) if (u) URL.revokeObjectURL(u);
    };
    // Re-run when the set of blobs changes identity/length.
  }, [blobs]);

  return urls;
}
