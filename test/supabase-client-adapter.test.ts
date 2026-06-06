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

/** Build a page of fake remote rows with incrementing updated_at values. */
function makeRows(count: number, startUpdatedAt = 1): RemoteRow[] {
  return Array.from({ length: count }, (_, i) => ({
    guid: `guid-${startUpdatedAt + i}`,
    user_id: "u1",
    updated_at: startUpdatedAt + i,
    deleted_at: null,
  }));
}

/**
 * Creates a minimal chainable stub for the supabase-js query builder that
 * returns `pages` in sequence (one page per `.range()` call).  Every method
 * except `.range()` returns `this` so the chain compiles.
 */
function makeChainableStub(pages: RemoteRow[][]) {
  let callIndex = 0;
  const builder = {
    select: () => builder,
    gt: () => builder,
    order: () => builder,
    range: (_from: number, _to: number) => {
      const page = pages[callIndex] ?? [];
      callIndex++;
      return Promise.resolve({ data: page, error: null });
    },
  };
  return { builder, getCallCount: () => callIndex };
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
// Tests
// ---------------------------------------------------------------------------

describe("pullSince — pagination", () => {
  it("returns all rows when the first page is smaller than PAGE_SIZE (single page)", async () => {
    const rows = makeRows(3, 10);
    const { builder } = makeChainableStub([rows]);
    const client = createSupabaseSyncClient(makeStubClient(builder));

    const result = await client.pullSince("tasks", 0);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.guid)).toEqual(rows.map((r) => r.guid));
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
