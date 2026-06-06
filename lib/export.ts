import { db } from "@/lib/db/schema";
import type { BacklogItem, Idea, Photo, Project, Task } from "@/lib/types";

export type SnapshotPhoto = Omit<Photo, "blob" | "thumb"> & {
  /** Raw base64 (no data: prefix). */
  blob: string;
  thumb: string;
  blobType: string; // MIME, e.g. "image/webp"
  thumbType: string;
};

export interface Snapshot {
  version: 3;
  exportedAt: number;
  projects: Project[];
  tasks: Task[];
  ideas: Idea[];
  backlog: BacklogItem[];
  photos: SnapshotPhoto[];
  meta: { key: string; value: unknown }[];
}

/**
 * Convert a Blob to a raw base64 string (no data: prefix).
 * Processes bytes in 32 KB chunks to avoid call-stack overflow on large blobs.
 * Uses only btoa (available in browser and Node ≥ 16) — no FileReader, no Buffer.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000; // 32 768 bytes
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(binary);
}

/** Full, unfiltered backup of every table (tombstones included). */
export async function exportSnapshot(): Promise<Snapshot> {
  const [projects, tasks, ideas, backlog, photos, meta] = await Promise.all([
    db.projects.toArray(),
    db.tasks.toArray(),
    db.ideas.toArray(),
    db.backlog.toArray(),
    db.photos.toArray(),
    db.meta.toArray(),
  ]);

  const snapshotPhotos: SnapshotPhoto[] = await Promise.all(
    photos.map(async (p) => {
      const { blob, thumb, ...rest } = p;
      return {
        ...rest,
        blob: await blobToBase64(blob),
        thumb: await blobToBase64(thumb),
        blobType: blob.type,
        thumbType: thumb.type,
      };
    }),
  );

  return {
    version: 3,
    exportedAt: Date.now(),
    projects,
    tasks,
    ideas,
    backlog,
    photos: snapshotPhotos,
    meta,
  };
}

/** Trigger a browser download of the snapshot as a JSON file. */
export async function downloadSnapshot(): Promise<void> {
  const snap = await exportSnapshot();
  const blob = new Blob([JSON.stringify(snap, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cadence-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
