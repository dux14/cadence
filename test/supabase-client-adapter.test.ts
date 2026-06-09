// Unit tests for createSupabaseSyncClient — focuses on pullSince pagination.
//
// The supabase-js query builder is a fluent chain that resolves to a promise.
// We fake only the `.from()` path used by pullSince with a minimal chainable
// stub so we can assert that range() is called across multiple pages and all
// rows are accumulated.

import { describe, it, expect } from "vitest";
import { createSupabaseSyncClient } from "@/lib/sync/supabase-client-adapter";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RemoteRow } from "@/lib/sync/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a page of fake remote rows with incrementing server_updated_at values.
 *  updated_at intentionally differs (lower) to confirm the filter/sort uses server_updated_at. */
function makeRows(count: number, startServerUpdatedAt = 1): RemoteRow[] {
  return Array.from({ length: count }, (_, i) => ({
    guid: `guid-${startServerUpdatedAt + i}`,
    user_id: "u1",
    updated_at: 1, // intentionally fixed/low — pagination keys off server_updated_at
    deleted_at: null,
    server_updated_at: startServerUpdatedAt + i,
  }));
}

/**
 * Creates a minimal chainable stub for the supabase-js query builder that
 * returns `pages` in sequence (one page per `.range()` call).  Every method
 * except `.range()` returns `this` so the chain compiles.
 * Also records the columns passed to `.gt()` and `.order()` for assertions.
 */
function makeChainableStub(pages: RemoteRow[][]) {
  let callIndex = 0;
  const gtColumns: string[] = [];
  const orderColumns: string[] = [];
  const builder = {
    select: () => builder,
    gt: (col: string) => { gtColumns.push(col); return builder; },
    order: (col: string) => { orderColumns.push(col); return builder; },
    range: (_from: number, _to: number) => {
      const page = pages[callIndex] ?? [];
      callIndex++;
      return Promise.resolve({ data: page, error: null });
    },
  };
  return {
    builder,
    getCallCount: () => callIndex,
    getGtColumns: () => gtColumns,
    getOrderColumns: () => orderColumns,
  };
}

/**
 * Build a minimal SupabaseClient stub whose `.from()` returns the provided
 * builder.  Other methods (auth, rpc, storage) throw if called.
 */
function makeStubClient(builder: ReturnType<typeof makeChainableStub>["builder"]) {
  return {
    from: (_table: string) => builder,
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    rpc: () => { throw new Error("rpc not implemented in this stub"); },
    storage: null,
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// getUserId
// ---------------------------------------------------------------------------

/**
 * Build a stub that exposes auth.getSession with a configurable return.
 * NOTE: The actual implementation uses auth.getUser (not getSession);
 * we stub getUser accordingly.
 */
function makeAuthStub(user: { id: string } | null) {
  return {
    from: () => { throw new Error("from not expected"); },
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error: null }),
    },
    rpc: () => { throw new Error("rpc not expected"); },
    storage: null,
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// upsert / countLive / uploadPhoto / createSignedUrl stubs
// ---------------------------------------------------------------------------

/** Minimal stub for the `rpc` path used by upsert. */
function makeRpcStub(returnData: unknown, returnError: unknown = null) {
  return {
    from: () => { throw new Error("from not expected in rpc test"); },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    rpc: (_name: string, _args: unknown) =>
      Promise.resolve({ data: returnData, error: returnError }),
    storage: null,
  } as unknown as SupabaseClient;
}

/** Minimal stub for the `.from(table).select(...).is(...)` path used by countLive. */
function makeCountStub(count: number | null, error: unknown = null) {
  const builder = {
    select: (_col: string, _opts: unknown) => builder,
    is: (_col: string, _val: unknown) => Promise.resolve({ count, error }),
  };
  return {
    from: (_table: string) => builder,
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    rpc: () => { throw new Error("rpc not expected"); },
    storage: null,
  } as unknown as SupabaseClient;
}

// Captures the last upload(body, opts) so tests can assert what was actually
// sent to Storage (ArrayBuffer body + contentType derived from the blob).
let capturedUpload: { body: unknown; opts: unknown } | null = null;

/** Minimal stub for the storage path used by uploadPhoto and createSignedUrl. */
function makeStorageStub(opts: {
  uploadResult?: { error: unknown };
  signedUrlResult?: { data: { signedUrl: string } | null; error: unknown };
}) {
  const bucket = {
    upload: (_path: string, _body: unknown, _opts: unknown) => {
      capturedUpload = { body: _body, opts: _opts };
      return Promise.resolve(opts.uploadResult ?? { error: null });
    },
    createSignedUrl: (_path: string, _expiry: number) =>
      Promise.resolve(opts.signedUrlResult ?? { data: { signedUrl: "https://signed/x" }, error: null }),
  };
  return {
    from: () => { throw new Error("from not expected in storage test"); },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    rpc: () => { throw new Error("rpc not expected"); },
    storage: { from: (_bucket: string) => bucket },
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pullSince — pagination", () => {
  it("returns all rows when the first page is smaller than PAGE_SIZE (single page)", async () => {
    const rows = makeRows(3, 10);
    const { builder, getGtColumns, getOrderColumns } = makeChainableStub([rows]);
    const client = createSupabaseSyncClient(makeStubClient(builder));

    const result = await client.pullSince("tasks", 0);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.guid)).toEqual(rows.map((r) => r.guid));

    // Must filter and sort by server_updated_at (not client updated_at).
    expect(getGtColumns()).toContain("server_updated_at");
    expect(getOrderColumns()).toContain("server_updated_at");
  });

  it("fetches multiple pages and concatenates them when pages are full", async () => {
    // Simulate PAGE_SIZE = 1000: two full pages + one partial.
    const page1 = makeRows(1000, 1);
    const page2 = makeRows(1000, 1001);
    const page3 = makeRows(42, 2001); // partial — signals end
    const { builder, getCallCount } = makeChainableStub([page1, page2, page3]);
    const client = createSupabaseSyncClient(makeStubClient(builder));

    const result = await client.pullSince("tasks", 0);

    // All 2042 rows must be present in order.
    expect(result).toHaveLength(2042);
    expect(result[0].guid).toBe("guid-1");
    expect(result[999].guid).toBe("guid-1000");
    expect(result[1000].guid).toBe("guid-1001");
    expect(result[2041].guid).toBe("guid-2042");

    // range() must have been called exactly 3 times.
    expect(getCallCount()).toBe(3);
  });

  it("stops fetching after an empty page (no rows beyond cursor)", async () => {
    const { builder, getCallCount } = makeChainableStub([[]]);
    const client = createSupabaseSyncClient(makeStubClient(builder));

    const result = await client.pullSince("tasks", 9999);
    expect(result).toHaveLength(0);
    expect(getCallCount()).toBe(1);
  });

  it("propagates server errors", async () => {
    const builder = {
      select: () => builder,
      gt: () => builder,
      order: () => builder,
      range: () => Promise.resolve({ data: null as unknown as RemoteRow[], error: new Error("db down") }),
    };
    const client = createSupabaseSyncClient(makeStubClient(builder as unknown as ReturnType<typeof makeChainableStub>["builder"]));

    await expect(client.pullSince("tasks", 0)).rejects.toThrow("db down");
  });
});

// ---------------------------------------------------------------------------
// getUserId
// ---------------------------------------------------------------------------

describe("getUserId", () => {
  it("returns the user id when a session exists", async () => {
    const sb = makeAuthStub({ id: "user-abc" });
    const client = createSupabaseSyncClient(sb);
    expect(await client.getUserId()).toBe("user-abc");
  });

  it("returns null when no session / user is present", async () => {
    const sb = makeAuthStub(null);
    const client = createSupabaseSyncClient(sb);
    expect(await client.getUserId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// upsert
// ---------------------------------------------------------------------------

describe("upsert", () => {
  it("calls rpc(upsert_lww) with p_table and p_rows and returns accepted guids", async () => {
    const guids = ["guid-1", "guid-2"];
    const sb = makeRpcStub(guids);
    const client = createSupabaseSyncClient(sb);

    const rows: RemoteRow[] = [
      { guid: "guid-1", user_id: "u1", updated_at: 10, deleted_at: null },
      { guid: "guid-2", user_id: "u1", updated_at: 20, deleted_at: null },
    ];
    const result = await client.upsert("tasks", rows);
    expect(result.accepted).toEqual(guids);
  });

  it("returns accepted=[] when rpc returns null data", async () => {
    const sb = makeRpcStub(null);
    const client = createSupabaseSyncClient(sb);
    const result = await client.upsert("tasks", [
      { guid: "g1", user_id: "u1", updated_at: 1, deleted_at: null },
    ]);
    expect(result.accepted).toEqual([]);
  });

  it("short-circuits and returns accepted=[] when rows array is empty", async () => {
    // rpc should never be called — stub it to throw.
    const sb = {
      from: () => { throw new Error("from not expected"); },
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
      rpc: () => { throw new Error("rpc must not be called for empty rows"); },
      storage: null,
    } as unknown as SupabaseClient;
    const client = createSupabaseSyncClient(sb);
    const result = await client.upsert("tasks", []);
    expect(result.accepted).toEqual([]);
  });

  it("throws when rpc returns an error", async () => {
    const sb = makeRpcStub(null, new Error("upsert error"));
    const client = createSupabaseSyncClient(sb);
    await expect(
      client.upsert("tasks", [{ guid: "g1", user_id: "u1", updated_at: 1, deleted_at: null }]),
    ).rejects.toThrow("upsert error");
  });
});

// ---------------------------------------------------------------------------
// countLive
// ---------------------------------------------------------------------------

describe("countLive", () => {
  it("returns the count from the server (non-null)", async () => {
    const sb = makeCountStub(42);
    const client = createSupabaseSyncClient(sb);
    expect(await client.countLive("projects")).toBe(42);
  });

  it("returns 0 when count is null (empty table)", async () => {
    const sb = makeCountStub(null);
    const client = createSupabaseSyncClient(sb);
    expect(await client.countLive("tasks")).toBe(0);
  });

  it("throws when the query returns an error", async () => {
    const sb = makeCountStub(null, new Error("count error"));
    const client = createSupabaseSyncClient(sb);
    await expect(client.countLive("ideas")).rejects.toThrow("count error");
  });
});

// ---------------------------------------------------------------------------
// uploadPhoto
// ---------------------------------------------------------------------------

describe("uploadPhoto", () => {
  it("uploads an ArrayBuffer body (not a Blob) so iOS Safari doesn't store 0 bytes", async () => {
    capturedUpload = null;
    const sb = makeStorageStub({ uploadResult: { error: null } });
    const client = createSupabaseSyncClient(sb);
    const blob = new Blob(["data"], { type: "image/webp" });
    await expect(client.uploadPhoto("u1/test.webp", blob)).resolves.toBeUndefined();
    const cap = capturedUpload as unknown as { body: unknown; opts: unknown };
    expect(cap.body).toBeInstanceOf(ArrayBuffer);
    expect((cap.body as ArrayBuffer).byteLength).toBe(4); // "data"
    expect(cap.opts).toMatchObject({ contentType: "image/webp", upsert: true });
  });

  it("derives contentType from the blob (iOS JPEG fallback), not a hardcoded webp", async () => {
    capturedUpload = null;
    const sb = makeStorageStub({ uploadResult: { error: null } });
    const client = createSupabaseSyncClient(sb);
    const blob = new Blob(["jpegbytes"], { type: "image/jpeg" });
    await client.uploadPhoto("u1/test.webp", blob);
    const cap = capturedUpload as unknown as { opts: unknown };
    expect(cap.opts).toMatchObject({ contentType: "image/jpeg" });
  });

  it("throws when storage upload returns an error", async () => {
    const sb = makeStorageStub({ uploadResult: { error: new Error("upload failed") } });
    const client = createSupabaseSyncClient(sb);
    const blob = new Blob(["data"]);
    await expect(client.uploadPhoto("u1/fail.webp", blob)).rejects.toThrow("upload failed");
  });
});

// ---------------------------------------------------------------------------
// createSignedUrl
// ---------------------------------------------------------------------------

describe("createSignedUrl", () => {
  it("returns the signedUrl from storage for the given path and expiry", async () => {
    const sb = makeStorageStub({
      signedUrlResult: { data: { signedUrl: "https://signed.example/photo.webp" }, error: null },
    });
    const client = createSupabaseSyncClient(sb);
    const url = await client.createSignedUrl("u1/photo.webp", 3600);
    expect(url).toBe("https://signed.example/photo.webp");
  });

  it("throws when storage createSignedUrl returns an error", async () => {
    const sb = makeStorageStub({
      signedUrlResult: { data: null, error: new Error("signing failed") },
    });
    const client = createSupabaseSyncClient(sb);
    await expect(client.createSignedUrl("u1/photo.webp", 3600)).rejects.toThrow("signing failed");
  });
});
