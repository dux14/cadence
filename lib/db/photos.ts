import { syncClock } from "@/lib/db/clock";
import { db } from "@/lib/db/schema";
import { newGuid } from "@/lib/id";
import { scheduleSync } from "@/lib/sync/orchestrator";
import type { Photo, PhotoParentType } from "@/lib/types";

export interface AddPhotoInput {
  parentType: PhotoParentType;
  parentGuid: string;
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/** Insert a fully-formed photo row. The binary lives only here. */
export async function addPhoto(input: AddPhotoInput): Promise<number> {
  const now = syncClock();
  const id = await db.photos.add({
    guid: newGuid(),
    parentType: input.parentType,
    parentGuid: input.parentGuid,
    blob: input.blob,
    thumb: input.thumb,
    width: input.width,
    height: input.height,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    remoteUrl: null,
  });
  scheduleSync();
  return id;
}

/** Live photos for a parent, oldest first. */
export async function listPhotos(parentGuid: string): Promise<Photo[]> {
  const rows = await db.photos.where("parentGuid").equals(parentGuid).toArray();
  return rows
    .filter((p) => p.deletedAt == null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Soft-delete (tombstone) a single photo. */
export async function tombstonePhoto(id: number): Promise<void> {
  const now = syncClock();
  await db.photos.update(id, { deletedAt: now, updatedAt: now });
  scheduleSync();
}

/**
 * Move every live photo from one parent to another (idea -> task on promote).
 * Tombstoned photos are left untouched.
 */
export async function reparentPhotos(
  fromParentGuid: string,
  toParentType: PhotoParentType,
  toParentGuid: string,
): Promise<void> {
  const now = syncClock();
  await db.transaction("rw", db.photos, async () => {
    const rows = await db.photos
      .where("parentGuid")
      .equals(fromParentGuid)
      .toArray();
    await Promise.all(
      rows
        .filter((p) => p.deletedAt == null)
        .map((p) =>
          db.photos.update(p.id!, {
            parentType: toParentType,
            parentGuid: toParentGuid,
            updatedAt: now,
          }),
        ),
    );
  });
  scheduleSync();
}

/** Tombstone all live photos of a parent (parent entity deleted). */
export async function tombstonePhotosForParent(
  parentGuid: string,
): Promise<void> {
  const now = syncClock();
  await db.transaction("rw", db.photos, async () => {
    const rows = await db.photos
      .where("parentGuid")
      .equals(parentGuid)
      .toArray();
    await Promise.all(
      rows
        .filter((p) => p.deletedAt == null)
        .map((p) =>
          db.photos.update(p.id!, { deletedAt: now, updatedAt: now }),
        ),
    );
  });
  scheduleSync();
}
