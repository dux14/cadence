import { db } from "@/lib/db/schema";
import type { SyncClient } from "@/lib/sync/types";
import { photoToRemote, photoFromRemote } from "@/lib/sync/mappers";
import { getLastPushedAt, setLastPushedAt, getPullCursor, setPullCursor } from "@/lib/sync/dirty";
import { syncClock } from "@/lib/db/clock";
import type { Photo } from "@/lib/types";

export function storagePathFor(userId: string, guid: string): string {
  return `${userId}/${guid}.webp`;
}

/**
 * Pull photo metadata rows from remote and apply LWW locally.
 *
 * This is the receive-side counterpart to pushPhotoMetadata.  Without it,
 * photos taken on device A never appear on device B's local DB.
 *
 * Cursor semantics: same as pullTable in engine.ts — tracks server_updated_at
 * (server-stamped receive-time) so that a late-uploading device is not
 * invisible to devices whose cursor already advanced.
 *
 * LWW rule: mirrors applyRemoteRow in engine.ts.
 *  - skip if existing.updatedAt > r.updated_at  (local is strictly newer)
 *  - if r.deleted_at != null → delete local row physically (if it exists)
 *  - if not exists → add with photoFromRemote (no blob/thumb; blob fetched on demand)
 *  - if exists → update metadata fields WITHOUT overwriting blob/thumb
 *    (never evict a cached blob — downloadPhotoBlob already guards the cache)
 */
export async function pullPhotoMetadata(client: SyncClient): Promise<void> {
  const cursor = await getPullCursor("photos");
  const rows = await client.pullSince("photos", cursor);
  if (rows.length === 0) return;
  let maxServerUpdated = cursor;
  for (const r of rows) {
    // Advance cursor by server_updated_at (defensive: skip advance if absent, but apply the row).
    if (r.server_updated_at != null) {
      maxServerUpdated = Math.max(maxServerUpdated, r.server_updated_at);
    }

    const existing = await db.photos.where("guid").equals(r.guid as string).first();

    // LWW: skip if local is strictly newer (compare client updated_at, not server stamp).
    if (existing && existing.updatedAt > (r.updated_at as number)) continue;

    // Tombstone: delete local row physically.
    if (r.deleted_at != null) {
      if (existing?.id != null) await db.photos.delete(existing.id);
      continue;
    }

    const data = photoFromRemote(r);

    if (!existing) {
      // New photo from remote: no blob or thumb yet — downloaded on demand.
      await db.photos.add(data as Photo);
    } else {
      // Update metadata fields only; preserve existing blob/thumb so we don't
      // evict a blob that was already downloaded and cached on this device.
      await db.photos.update(existing.id!, {
        parentType: data.parentType,
        parentGuid: data.parentGuid,
        width: data.width,
        height: data.height,
        updatedAt: data.updatedAt,
        deletedAt: data.deletedAt,
        remoteUrl: data.remoteUrl,
        // blob and thumb intentionally NOT touched
      });
    }
  }
  await setPullCursor("photos", maxServerUpdated);
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
