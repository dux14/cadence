import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db/schema";
import type { SyncClient } from "@/lib/sync/types";
import { storagePathFor, uploadPendingPhotos, pushPhotoMetadata } from "@/lib/sync/photos";

function mockClient(): SyncClient {
  return {
    getUserId: async () => "u1",
    upsert: vi.fn(async () => ({ accepted: [] })),
    pullSince: async () => [],
    countLive: async () => 0,
    uploadPhoto: vi.fn(async () => {}),
    createSignedUrl: async () => "https://signed/x",
  };
}

beforeEach(async () => {
  await db.photos.clear();
  await db.meta.clear();
});

describe("storagePathFor", () => {
  it("builds <user_id>/<guid>.webp", () => {
    expect(storagePathFor("u1", "g9")).toBe("u1/g9.webp");
  });
});

describe("uploadPendingPhotos", () => {
  it("uploads blobs whose remoteUrl is null and sets storage_path", async () => {
    const client = mockClient();
    await db.photos.add({
      guid: "g1",
      parentType: "task",
      parentGuid: "t1",
      blob: new Blob(["x"], { type: "image/webp" }),
      thumb: new Blob(["y"], { type: "image/webp" }),
      width: 10,
      height: 10,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      remoteUrl: null,
    });
    await uploadPendingPhotos(client, "u1");
    expect(client.uploadPhoto).toHaveBeenCalledWith(
      "u1/g1.webp",
      expect.any(Blob),
    );
    const row = await db.photos.where("guid").equals("g1").first();
    expect(row!.remoteUrl).toBe("u1/g1.webp");
  });

  it("skips photos that already have a remoteUrl", async () => {
    const client = mockClient();
    await db.photos.add({
      guid: "g2",
      parentType: "task",
      parentGuid: "t1",
      blob: new Blob(["x"]),
      thumb: new Blob(["y"]),
      width: 10,
      height: 10,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      remoteUrl: "u1/g2.webp",
    });
    await uploadPendingPhotos(client, "u1");
    expect(client.uploadPhoto).not.toHaveBeenCalled();
  });
});

describe("pushPhotoMetadata", () => {
  it("upserts photo metadata with the storage_path", async () => {
    const client = mockClient();
    await db.photos.add({
      guid: "g3",
      parentType: "idea",
      parentGuid: "i1",
      blob: new Blob(["x"]),
      thumb: new Blob(["y"]),
      width: 20,
      height: 20,
      createdAt: 5,
      updatedAt: 5,
      deletedAt: null,
      remoteUrl: "u1/g3.webp",
    });
    await pushPhotoMetadata(client, "u1");
    expect(client.upsert).toHaveBeenCalledWith(
      "photos",
      expect.arrayContaining([
        expect.objectContaining({
          guid: "g3",
          parent_type: "idea",
          storage_path: "u1/g3.webp",
        }),
      ]),
    );
  });
});
