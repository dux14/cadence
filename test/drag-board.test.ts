import { describe, expect, it } from "vitest";
import {
  resolveBucketAt,
  applyReorder,
  applyTransfer,
  adjacentBucket,
  moveByOffset,
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

describe("adjacentBucket", () => {
  const buckets = ["today", "tomorrow", "week"] as const;

  it("today + 1 = tomorrow", () => {
    expect(adjacentBucket("today", 1, buckets)).toBe("tomorrow");
  });

  it("tomorrow - 1 = today", () => {
    expect(adjacentBucket("tomorrow", -1, buckets)).toBe("today");
  });

  it("tomorrow + 1 = week", () => {
    expect(adjacentBucket("tomorrow", 1, buckets)).toBe("week");
  });

  it("week - 1 = tomorrow", () => {
    expect(adjacentBucket("week", -1, buckets)).toBe("tomorrow");
  });

  it("today - 1 = null (left edge)", () => {
    expect(adjacentBucket("today", -1, buckets)).toBeNull();
  });

  it("week + 1 = null (right edge)", () => {
    expect(adjacentBucket("week", 1, buckets)).toBeNull();
  });

  it("returns null when current bucket is not present in buckets", () => {
    expect(adjacentBucket("today", 1, ["tomorrow", "week"] as readonly string[] as readonly any[])).toBeNull();
  });
});

describe("moveByOffset", () => {
  it("moves id forward by +1 in the middle", () => {
    const result = moveByOffset([1, 2, 3, 4], 2, 1);
    expect(result).toEqual([1, 3, 2, 4]);
  });

  it("moves id backward by -1 in the middle", () => {
    const result = moveByOffset([1, 2, 3, 4], 3, -1);
    expect(result).toEqual([1, 3, 2, 4]);
  });

  it("returns null when moving first item backward (-1)", () => {
    expect(moveByOffset([1, 2, 3], 1, -1)).toBeNull();
  });

  it("returns null when moving last item forward (+1)", () => {
    expect(moveByOffset([1, 2, 3], 3, 1)).toBeNull();
  });

  it("returns null when id is not in the array", () => {
    expect(moveByOffset([1, 2, 3], 99, 1)).toBeNull();
  });

  it("does not mutate the input array", () => {
    const input = [1, 2, 3, 4];
    const result = moveByOffset(input, 2, 1);
    expect(input).toEqual([1, 2, 3, 4]);
    expect(result).not.toBe(input);
  });

  it("moves item from position 0 to position 1 (+1)", () => {
    expect(moveByOffset([10, 20, 30], 10, 1)).toEqual([20, 10, 30]);
  });

  it("moves item from last to second-to-last (-1)", () => {
    expect(moveByOffset([10, 20, 30], 30, -1)).toEqual([10, 30, 20]);
  });
});
