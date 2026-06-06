import { describe, expect, it } from "vitest";
import {
  resolveBucketAt,
  applyReorder,
  applyTransfer,
  type ColumnRect,
} from "@/lib/drag-board";

describe("resolveBucketAt", () => {
  const columns: ColumnRect[] = [
    { bucket: "today", rect: { left: 0, right: 300 } },
    { bucket: "tomorrow", rect: { left: 300, right: 600 } },
    { bucket: "week", rect: { left: 600, right: 900 } },
  ];

  it("returns the bucket whose horizontal span contains x", () => {
    expect(resolveBucketAt(150, columns)).toBe("today");
    expect(resolveBucketAt(450, columns)).toBe("tomorrow");
    expect(resolveBucketAt(750, columns)).toBe("week");
  });

  it("clamps to the nearest edge column when x is out of bounds", () => {
    expect(resolveBucketAt(-50, columns)).toBe("today");
    expect(resolveBucketAt(9999, columns)).toBe("week");
  });

  it("returns null when there are no columns", () => {
    expect(resolveBucketAt(100, [])).toBeNull();
  });

  describe("nearest-edge resolution for inter-column gaps (gap-4 ≈ 16 px)", () => {
    const gapped: ColumnRect[] = [
      { bucket: "today",    rect: { left: 0,   right: 284 } },
      { bucket: "tomorrow", rect: { left: 300, right: 584 } },
      { bucket: "week",     rect: { left: 600, right: 884 } },
    ];

    it("resolves to 'today' when x=290 (6 px from right-of-today, 10 from left-of-tomorrow)", () => {
      expect(resolveBucketAt(290, gapped)).toBe("today");
    });

    it("resolves to 'tomorrow' when x=296 (4 px from left-of-tomorrow, 12 from right-of-today)", () => {
      expect(resolveBucketAt(296, gapped)).toBe("tomorrow");
    });

    it("still clamps to 'today' when x is before the first column (x=-10)", () => {
      expect(resolveBucketAt(-10, gapped)).toBe("today");
    });

    it("still clamps to 'week' when x is after the last column (x=9999)", () => {
      expect(resolveBucketAt(9999, gapped)).toBe("week");
    });
  });
});

describe("applyReorder", () => {
  it("moves an id to the slot of the hovered id (down)", () => {
    expect(applyReorder([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
  });

  it("moves an id to the slot of the hovered id (up)", () => {
    expect(applyReorder([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
  });

  it("is a no-op when dragId equals overId", () => {
    expect(applyReorder([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
  });

  it("is a no-op when an id is missing", () => {
    expect(applyReorder([1, 2, 3], 9, 2)).toEqual([1, 2, 3]);
  });
});

describe("applyTransfer", () => {
  it("removes the id from source and appends to target end", () => {
    const r = applyTransfer({ today: [1, 2, 3], tomorrow: [4] }, 2, "today", "tomorrow");
    expect(r).toEqual({ today: [1, 3], tomorrow: [4, 2] });
  });

  it("inserts before overId in the target when provided", () => {
    const r = applyTransfer(
      { today: [1, 2], tomorrow: [4, 5] },
      2,
      "today",
      "tomorrow",
      5,
    );
    expect(r).toEqual({ today: [1], tomorrow: [4, 2, 5] });
  });

  it("is a no-op when source === target", () => {
    const board = { today: [1, 2], tomorrow: [3] };
    expect(applyTransfer(board, 1, "today", "today")).toEqual(board);
  });
});
