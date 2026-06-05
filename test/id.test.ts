import { describe, expect, it, vi } from "vitest";
import { newGuid } from "@/lib/id";

describe("newGuid", () => {
  it("returns a v4 UUID string", () => {
    const g = newGuid();
    expect(g).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("returns unique values", () => {
    const set = new Set(Array.from({ length: 1000 }, () => newGuid()));
    expect(set.size).toBe(1000);
  });

  it("falls back to getRandomValues when randomUUID is unavailable", () => {
    const original = crypto.randomUUID;
    // @ts-expect-error force the fallback path
    delete (crypto as { randomUUID?: unknown }).randomUUID;
    try {
      const g = newGuid();
      expect(g).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    } finally {
      crypto.randomUUID = original;
    }
  });
});
