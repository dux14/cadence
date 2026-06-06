import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db/schema";
import type { RemoteRow, SyncClient } from "@/lib/sync/types";
import { storagePathFor, uploadPendingPhotos, pushPhotoMetadata, downloadPhotoBlob } from "@/lib/sync/photos";
import { getLastPushedAt } from "@/lib/sync/dirty";

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

afterEach(() => {
  vi.unstubAllGlobals();
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

  function photoRow(guid: string, updatedAt: number) {
    return {
      guid,
      parentType: "task" as const,
      parentGuid: "t1",
      blob: new Blob(["x"]),
      thumb: new Blob(["y"]),
      width: 10,
      height: 10,
      createdAt: updatedAt,
      updatedAt,
      deletedAt: null,
      remoteUrl: `u1/${guid}.webp`,
    };
  }

  it("advances cursor to max updatedAt when every row is accepted", async () => {
    const client = mockClient();
    client.upsert = vi.fn(async (_t, rows: RemoteRow[]) => ({
      accepted: rows.map((r) => r.guid),
    }));
    await db.photos.add(photoRow("g4", 10));
    await db.photos.add(photoRow("g5", 20));
    await pushPhotoMetadata(client, "u1");
    expect(await getLastPushedAt("photos")).toBe(20);
  });

  it("keeps LWW-rejected photos dirty by rolling the cursor back", async () => {
    const client = mockClient();
    // Server accepts g5 (@20) but rejects g4 (@10) — cursor must stay below 10.
    client.upsert = vi.fn(async () => ({ accepted: ["g5"] }));
    await db.photos.add(photoRow("g4", 10));
    await db.photos.add(photoRow("g5", 20));
    await pushPhotoMetadata(client, "u1");
    expect(await getLastPushedAt("photos")).toBe(9);

    // Next push re-sends the rejected row (and the accepted one above the
    // rollback point — harmless, the upsert is idempotent).
    await pushPhotoMetadata(client, "u1");
    const secondCallRows = vi.mocked(client.upsert).mock.calls[1][1];
    expect(secondCallRows.map((r) => r.guid)).toContain("g4");
  });
});

// ---------------------------------------------------------------------------
// downloadPhotoBlob
// ---------------------------------------------------------------------------

describe("downloadPhotoBlob", () => {
  it("returns null when no row exists for the given guid", async () => {
    const client = mockClient();
    const result = await downloadPhotoBlob(client, "nonexistent-guid");
    expect(result).toBeNull();
  });

  it("returns null when the row exists but has no remoteUrl", async () => {
    const client = mockClient();
    await db.photos.add({
      guid: "dl-no-url",
      parentType: "task",
      parentGuid: "t1",
      blob: new Blob(["x"]),
      thumb: new Blob(["y"]),
      width: 10,
      height: 10,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      remoteUrl: null,
    });
    const result = await downloadPhotoBlob(client, "dl-no-url");
    expect(result).toBeNull();
  });

  it("returns the cached blob immediately without fetching when blob is already set", async () => {
    const client = mockClient();
    const cachedBlob = new Blob(["cached"], { type: "image/webp" });
    await db.photos.add({
      guid: "dl-cached",
      parentType: "task",
      parentGuid: "t1",
      blob: cachedBlob,
      thumb: new Blob(["y"]),
      width: 10,
      height: 10,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      remoteUrl: "u1/dl-cached.webp",
    });

    // If fetch is called, the test should fail — stub it to throw.
    vi.stubGlobal("fetch", () => { throw new Error("fetch should not be called for cached blobs"); });

    const result = await downloadPhotoBlob(client, "dl-cached");
    // Blob is returned from in-memory row (not round-tripped through IDB),
    // but fake-indexeddb may re-wrap it — compare by size and type.
    expect(result).not.toBeNull();
    expect(result!.size).toBe(cachedBlob.size);
    expect(result!.type).toBe(cachedBlob.type);
  });

  it("downloads the blob via signed URL, caches it in db, and returns it", async () => {
    const client = mockClient();
    const downloadedBlob = new Blob(["downloaded-data"], { type: "image/webp" });

    await db.photos.add({
      guid: "dl-happy",
      parentType: "task",
      parentGuid: "t1",
      blob: undefined as unknown as Blob, // no cached blob
      thumb: new Blob(["y"]),
      width: 10,
      height: 10,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      remoteUrl: "u1/dl-happy.webp",
    });

    // Mock createSignedUrl to return a test URL.
    client.createSignedUrl = vi.fn(async () => "https://signed.example/dl-happy");

    // Mock global fetch to return a successful response with our blob.
    vi.stubGlobal("fetch", vi.fn(async (_url: string) => ({
      ok: true,
      blob: async () => downloadedBlob,
    } as Response)));

    const result = await downloadPhotoBlob(client, "dl-happy");
    expect(result).not.toBeNull();
    expect(result!.size).toBe(downloadedBlob.size);

    // Verify it was cached in the db (by size, since IDB may re-wrap Blob).
    const row = await db.photos.where("guid").equals("dl-happy").first();
    expect(row!.blob).not.toBeNull();
    expect(row!.blob!.size).toBe(downloadedBlob.size);

    // Verify the signed URL was requested with the right path and expiry.
    expect(client.createSignedUrl).toHaveBeenCalledWith("u1/dl-happy.webp", 3600);
  });

  it("returns null when the fetch response is not ok", async () => {
    const client = mockClient();
    await db.photos.add({
      guid: "dl-not-ok",
      parentType: "task",
      parentGuid: "t1",
      blob: undefined as unknown as Blob,
      thumb: new Blob(["y"]),
      width: 10,
      height: 10,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      remoteUrl: "u1/dl-not-ok.webp",
    });

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false } as Response)));

    const result = await downloadPhotoBlob(client, "dl-not-ok");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    const client = mockClient();
    await db.photos.add({
      guid: "dl-throw",
      parentType: "task",
      parentGuid: "t1",
      blob: undefined as unknown as Blob,
      thumb: new Blob(["y"]),
      width: 10,
      height: 10,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      remoteUrl: "u1/dl-throw.webp",
    });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network error"); }));

    const result = await downloadPhotoBlob(client, "dl-throw");
    expect(result).toBeNull();
  });
});
