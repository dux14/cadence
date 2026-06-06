import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { db } from "@/lib/db/schema";
import { addProject, addTask } from "@/lib/db/queries";
import { addPhoto, tombstonePhoto } from "@/lib/db/photos";
import { exportSnapshot } from "@/lib/export";

beforeEach(async () => {
  db.close();
  await Dexie.delete("cadence");
  await db.open();
});

describe("exportSnapshot", () => {
  it("includes every table and a version + timestamp", async () => {
    const pid = await addProject("HKN", "active");
    await addTask({ title: "task", projectId: pid, bucket: "today" });

    const snap = await exportSnapshot();
    expect(snap.version).toBe(3);
    expect(typeof snap.exportedAt).toBe("number");
    expect(snap.projects.length).toBe(1);
    expect(snap.tasks.length).toBe(1);
    expect(Array.isArray(snap.ideas)).toBe(true);
    expect(Array.isArray(snap.backlog)).toBe(true);
    expect(Array.isArray(snap.meta)).toBe(true);
    expect(Array.isArray(snap.photos)).toBe(true);
  });

  it("includes tombstoned rows (full backup, not filtered)", async () => {
    const pid = await addProject("HKN", "active");
    const tid = await addTask({ title: "task", projectId: pid, bucket: "today" });
    await db.tasks.update(tid, { deletedAt: Date.now() });
    const snap = await exportSnapshot();
    expect(snap.tasks.length).toBe(1); // tombstone still backed up
  });

  it("exports photos with base64-encoded binaries", async () => {
    const pid = await addProject("HKN", "active");
    const tid = await addTask({ title: "task", projectId: pid, bucket: "today" });
    const task = await db.tasks.get(tid);
    const guid = task!.guid;

    // Use a variety of byte values including >127 to exercise btoa correctly
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const thumbBytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) thumbBytes[i] = (i * 17) & 0xff;

    const photoBlob = new Blob([bytes], { type: "image/webp" });
    const thumbBlob = new Blob([thumbBytes], { type: "image/webp" });

    await addPhoto({
      parentType: "task",
      parentGuid: guid,
      blob: photoBlob,
      thumb: thumbBlob,
      width: 100,
      height: 50,
    });

    const snap = await exportSnapshot();
    expect(snap.photos.length).toBe(1);

    const photo = snap.photos[0];
    expect(typeof photo.blob).toBe("string");
    expect(typeof photo.thumb).toBe("string");
    expect(photo.blobType).toBe("image/webp");
    expect(photo.thumbType).toBe("image/webp");

    // Round-trip: decode base64 and compare byte by byte
    const decodedBlob = Uint8Array.from(atob(photo.blob), (c) => c.charCodeAt(0));
    expect(decodedBlob).toEqual(bytes);

    const decodedThumb = Uint8Array.from(atob(photo.thumb), (c) => c.charCodeAt(0));
    expect(decodedThumb).toEqual(thumbBytes);

    // JSON serialisation round-trip: must not produce "{}"
    const roundTripped = JSON.parse(JSON.stringify(snap));
    expect(roundTripped.photos[0].blob).toBe(photo.blob);
  });

  it("includes tombstoned photos (full backup, not filtered)", async () => {
    const pid = await addProject("HKN", "active");
    const tid = await addTask({ title: "task", projectId: pid, bucket: "today" });
    const task = await db.tasks.get(tid);
    const guid = task!.guid;

    const bytes = new Uint8Array([1, 2, 3]);
    const photoId = await addPhoto({
      parentType: "task",
      parentGuid: guid,
      blob: new Blob([bytes], { type: "image/webp" }),
      thumb: new Blob([bytes], { type: "image/webp" }),
      width: 10,
      height: 10,
    });

    await tombstonePhoto(photoId);

    const snap = await exportSnapshot();
    expect(snap.photos.length).toBe(1);
    expect(typeof snap.photos[0].deletedAt).toBe("number");
  });

  it("snapshot photo preserves guid, parentGuid, width, height", async () => {
    const pid = await addProject("HKN", "active");
    const tid = await addTask({ title: "task", projectId: pid, bucket: "today" });
    const task = await db.tasks.get(tid);
    const parentGuid = task!.guid;

    const bytes = new Uint8Array([42, 43, 44]);
    await addPhoto({
      parentType: "task",
      parentGuid,
      blob: new Blob([bytes], { type: "image/webp" }),
      thumb: new Blob([bytes], { type: "image/webp" }),
      width: 320,
      height: 240,
    });

    const snap = await exportSnapshot();
    const photo = snap.photos[0];
    expect(typeof photo.guid).toBe("string");
    expect(photo.guid.length).toBeGreaterThan(0);
    expect(photo.parentGuid).toBe(parentGuid);
    expect(photo.width).toBe(320);
    expect(photo.height).toBe(240);
  });
});
