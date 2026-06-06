import { describe, expect, it } from "vitest";
import { localDateKey, formatDayLabel, formatTime, formatHistoryDate } from "@/lib/date";

describe("localDateKey", () => {
  it("returns YYYY-MM-DD format for a given date", () => {
    const d = new Date(2026, 5, 3); // June 3, 2026 (month is 0-indexed)
    expect(localDateKey(d)).toBe("2026-06-03");
  });

  it("zero-pads single-digit months and days", () => {
    const d = new Date(2024, 0, 9); // January 9, 2024
    expect(localDateKey(d)).toBe("2024-01-09");
  });

  it("uses local time (not UTC)", () => {
    // Use a known date with explicit local construction.
    const d = new Date(2025, 11, 31); // December 31, 2025 local
    expect(localDateKey(d)).toBe("2025-12-31");
  });

  it("defaults to today when called with no argument", () => {
    const result = localDateKey();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Must be a sensible year (not epoch/far future).
    const year = Number(result.split("-")[0]);
    expect(year).toBeGreaterThanOrEqual(2024);
    expect(year).toBeLessThanOrEqual(2100);
  });

  it("correctly handles year boundaries", () => {
    expect(localDateKey(new Date(2023, 11, 31))).toBe("2023-12-31");
    expect(localDateKey(new Date(2024, 0, 1))).toBe("2024-01-01");
  });
});

describe("formatTime", () => {
  it("formats midnight as 12:00 am", () => {
    expect(formatTime("00:00")).toBe("12:00 am");
  });

  it("formats noon as 12:00 pm", () => {
    expect(formatTime("12:00")).toBe("12:00 pm");
  });

  it("formats 06:05 as 6:05 am (no leading zero on hour)", () => {
    expect(formatTime("06:05")).toBe("6:05 am");
  });

  it("formats 13:30 as 1:30 pm", () => {
    expect(formatTime("13:30")).toBe("1:30 pm");
  });

  it("formats 23:59 as 11:59 pm", () => {
    expect(formatTime("23:59")).toBe("11:59 pm");
  });

  it("pads single-digit minutes with leading zero", () => {
    expect(formatTime("09:05")).toBe("9:05 am");
  });
});

// formatHistoryDate / formatDayLabel are locale-dependent presentation —
// these are smoke tests (output exists, varies by date), NOT format contracts.
describe("formatHistoryDate", () => {
  it("returns a non-empty string for a valid key", () => {
    const result = formatHistoryDate("2026-06-03");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("encodes the day number in the output", () => {
    // June 3, 2026 — the '3' should appear in the formatted string.
    const result = formatHistoryDate("2026-06-03");
    expect(result).toContain("3");
  });

  it("different keys produce different labels", () => {
    const a = formatHistoryDate("2026-01-01");
    const b = formatHistoryDate("2026-06-15");
    expect(a).not.toBe(b);
  });
});

describe("formatDayLabel", () => {
  it("returns a non-empty string for a given date", () => {
    const result = formatDayLabel(new Date(2026, 5, 3));
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("defaults to today when called with no argument", () => {
    const result = formatDayLabel();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("different dates produce different labels", () => {
    const a = formatDayLabel(new Date(2026, 0, 1));
    const b = formatDayLabel(new Date(2026, 6, 15));
    expect(a).not.toBe(b);
  });
});
