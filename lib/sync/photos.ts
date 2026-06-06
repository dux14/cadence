import { db } from "@/lib/db/schema";
import type { SyncClient } from "@/lib/sync/types";
import { photoToRemote } from "@/lib/sync/mappers";
import { getLastPushedAt, setLastPushedAt } from "@/lib/sync/dirty";
import { syncClock } from "@/lib/db/clock";

export function storagePathFor(userId: string, guid: string): string {
  return `${userId}/${guid}.webp`;
}

/**
 * Background upload: for every local photo without a remoteUrl, push the
 * full-size blob to Storage and record its storage_path locally. Runs only
 * when online; failures are swallowed so the UI never blocks.
 */
export async function uploadPendingPhotos(
  client: SyncClient,
  userId: string,
): Promise<void> {
  const pending = (await db.photos.toArray()).filter(
    (p) => p.remoteUrl == null && p.deletedAt == null,
  );
  for (const p of pending) {
    const path = storagePathFor(userId, p.guid);
    try {
      await client.uploadPhoto(path, p.blob);
      await db.photos.update(p.id!, {
        remoteUrl: path,
        updatedAt: syncClock(),
      });
    } catch {
      // leave remoteUrl null; retried on next sync tick
    }
  }
}

/**
 * Push photo metadata rows (no blob) so other devices learn they exist.
 *
 * Note: engine.ts syncOnceInternal only iterates over the relational tables
 * [projects, tasks, ideas, backlog] — "photos" is intentionally excluded from
 * that loop. This function owns the sync.lastPushedAt.photos cursor and is
 * called separately (e.g. after uploadPendingPhotos). The cursor key is
 * shared with dirty.ts helpers to avoid duplicating constants.
 */
export async function pushPhotoMetadata(
  client: SyncClient,
  userId: string,
): Promise<void> {
  const since = await getLastPushedAt("photos");
  const dirty = (await db.photos.toArray()).filter(
    (p) => p.updatedAt > since,
  );
  if (dirty.length === 0) return;
  const rows = dirty.map((p) => photoToRemote(p, userId, p.remoteUrl ?? null));
  const { accepted } = await client.upsert("photos", rows);
  const acceptedSet = new Set(accepted);
  const rejected = dirty.filter((p) => !acceptedSet.has(p.guid));
  let next: number;
  if (rejected.length === 0) {
    next = dirty.reduce((m, p) => Math.max(m, p.updatedAt), since);
  } else {
    // Rejected rows must stay dirty: advance only below the oldest rejection.
    // Re-pushing accepted rows above that point is harmless (idempotent upsert).
    next = rejected.reduce((m, p) => Math.min(m, p.updatedAt), Infinity) - 1;
    next = Math.max(next, since);
  }
  await setLastPushedAt("photos", next);
}

/**
 * On another device: pull photo metadata, then download the blob on demand
 * via signed URL and cache it in IndexedDB so it survives offline.
 */
export async function downloadPhotoBlob(
  client: SyncClient,
  guid: string,
): Promise<Blob | null> {
  const row = await db.photos.where("guid").equals(guid).first();
  if (!row || !row.remoteUrl) return null;
  if (row.blob) return row.blob; // already cached
  try {
    const url = await client.createSignedUrl(row.remoteUrl, 60 * 60);
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    await db.photos.update(row.id!, { blob });
    return blob;
  } catch {
    return null;
  }
}
