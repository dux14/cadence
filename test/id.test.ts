import { describe, expect, it } from "vitest";
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
    Reflect.deleteProperty(crypto, "randomUUID");
    try {
      const g = newGuid();
      expect(g).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    } finally {
      crypto.randomUUID = original;
    }
  });

  it("fallback path: produces UUID with correct version (4) and variant bits", () => {
    // Override crypto so that randomUUID is absent, forcing the fallback path.
    const savedCrypto = globalThis.crypto;
    const mockCrypto = {
      getRandomValues: (buf: Uint8Array) => {
        savedCrypto.getRandomValues(buf);
        return buf;
      },
      // Intentionally omit randomUUID to trigger the fallback branch.
    };
    Object.defineProperty(globalThis, "crypto", {
      value: mockCrypto,
      writable: true,
      configurable: true,
    });

    try {
      const g = newGuid();
      expect(g).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      // Version nibble must be 4.
      expect(g[14]).toBe("4");
      // Variant nibble must be 8, 9, a, or b.
      expect(g[19]).toMatch(/^[89ab]$/i);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: savedCrypto,
        writable: true,
        configurable: true,
      });
    }
  });

  it("fallback produces unique values", () => {
    const savedCrypto = globalThis.crypto;
    const mockCrypto = {
      getRandomValues: (buf: Uint8Array) => {
        savedCrypto.getRandomValues(buf);
        return buf;
      },
    };
    Object.defineProperty(globalThis, "crypto", {
      value: mockCrypto,
      writable: true,
      configurable: true,
    });

    try {
      const ids = new Set(Array.from({ length: 100 }, () => newGuid()));
      expect(ids.size).toBe(100);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: savedCrypto,
        writable: true,
        configurable: true,
      });
    }
  });
});
