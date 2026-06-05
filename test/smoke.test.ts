import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("has indexedDB available", () => {
    expect(typeof indexedDB).not.toBe("undefined");
  });
});
