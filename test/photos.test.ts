import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/schema";
import {
  addPhoto,
  listPhotos,
  tombstonePhoto,
  reparentPhotos,
  tombstonePhotosForParent,
} from "@/lib/db/photos";

function fakeBlob(text = "x"): Blob {
  return new Blob([text], { type: "image/webp" });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("addPhoto", () => {
  it("persists a photo with a guid and timestamps", async () => {
    const id = await addPhoto({
      parentType: "task",
      parentGuid: "task-1",
      blob: fakeBlob("full"),
      thumb: fakeBlob("thumb"),
      width: 1600,
      height: 1200,
    });
    const row = await db.photos.get(id);
    expect(row).toBeDefined();
    expect(row!.guid).toMatch(/.+/);
    expect(row!.parentGuid).toBe("task-1");
    expect(row!.width).toBe(1600);
    expect(row!.deletedAt).toBeNull();
    expect(row!.remoteUrl).toBeNull();
    expect(row!.createdAt).toBeGreaterThan(0);
    expect(row!.updatedAt).toBe(row!.createdAt);
  });
});

describe("listPhotos", () => {
  it("returns only live photos for a parent, oldest first", async () => {
    await addPhoto({ parentType: "task", parentGuid: "p1", blob: fakeBlob(), thumb: fakeBlob(), width: 10, height: 10 });
    await addPhoto({ parentType: "task", parentGuid: "p1", blob: fakeBlob(), thumb: fakeBlob(), width: 10, height: 10 });
    await addPhoto({ parentType: "task", parentGuid: "other", blob: fakeBlob(), thumb: fakeBlob(), width: 10, height: 10 });
    const list = await listPhotos("p1");
    expect(list).toHaveLength(2);
    expect(list[0].createdAt).toBeLessThanOrEqual(list[1].createdAt);
  });

  it("excludes tombstoned photos", async () => {
    const id = await addPhoto({ parentType: "task", parentGuid: "p1", blob: fakeBlob(), thumb: fakeBlob(), width: 10, height: 10 });
    await tombstonePhoto(id);
    expect(await listPhotos("p1")).toHaveLength(0);
  });
});

describe("tombstonePhoto", () => {
  it("sets deletedAt and bumps updatedAt without physical delete", async () => {
    const id = await addPhoto({ parentType: "task", parentGuid: "p1", blob: fakeBlob(), thumb: fakeBlob(), width: 10, height: 10 });
    await tombstonePhoto(id);
    const row = await db.photos.get(id);
    expect(row).toBeDefined();
    expect(row!.deletedAt).toBeGreaterThan(0);
  });
});

describe("reparentPhotos", () => {
  it("moves live photos to a new parent and type, bumping updatedAt", async () => {
    const id = await addPhoto({ parentType: "idea", parentGuid: "idea-1", blob: fakeBlob(), thumb: fakeBlob(), width: 10, height: 10 });
    const before = (await db.photos.get(id))!.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await reparentPhotos("idea-1", "task", "task-9");
    const row = (await db.photos.get(id))!;
    expect(row.parentType).toBe("task");
    expect(row.parentGuid).toBe("task-9");
    expect(row.updatedAt).toBeGreaterThan(before);
    expect(await listPhotos("idea-1")).toHaveLength(0);
    expect(await listPhotos("task-9")).toHaveLength(1);
  });

  it("does not move tombstoned photos", async () => {
    const id = await addPhoto({ parentType: "idea", parentGuid: "idea-1", blob: fakeBlob(), thumb: fakeBlob(), width: 10, height: 10 });
    await tombstonePhoto(id);
    await reparentPhotos("idea-1", "task", "task-9");
    const row = (await db.photos.get(id))!;
    expect(row.parentGuid).toBe("idea-1");
  });
});

describe("tombstonePhotosForParent", () => {
  it("tombstones every live photo of a parent", async () => {
    await addPhoto({ parentType: "task", parentGuid: "p1", blob: fakeBlob(), thumb: fakeBlob(), width: 10, height: 10 });
    await addPhoto({ parentType: "task", parentGuid: "p1", blob: fakeBlob(), thumb: fakeBlob(), width: 10, height: 10 });
    await tombstonePhotosForParent("p1");
    expect(await listPhotos("p1")).toHaveLength(0);
    expect(await db.photos.where("parentGuid").equals("p1").count()).toBe(2);
  });
});
