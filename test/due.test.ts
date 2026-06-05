import { describe, expect, it } from "vitest";
import {
  formatDue,
  isOverdue,
  dueToInputs,
  inputsToDue,
} from "@/lib/due";

const at = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(y, mo, d, h, mi, 0, 0).getTime();

describe("isOverdue", () => {
  it("is true for a past timestamp", () => {
    expect(isOverdue(Date.now() - 60_000)).toBe(true);
  });
  it("is false for a future timestamp", () => {
    expect(isOverdue(Date.now() + 60_000)).toBe(false);
  });
  it("is false for null", () => {
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });
});

describe("formatDue", () => {
  it("shows the time for a due today with hour", () => {
    const now = new Date();
    const due = at(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0);
    const out = formatDue(due, true, now);
    expect(out.toLowerCase()).toContain("hoy");
  });

  it("shows a short month+day label for a non-adjacent date", () => {
    const now = at(2026, 5, 5); // Jun 5
    const due = at(2026, 5, 12); // Jun 12
    const out = formatDue(due, false, new Date(now));
    expect(out).toBe("jun 12");
  });

  it("appends the short time on a non-adjacent date with hour", () => {
    const now = at(2026, 5, 5);
    const due = at(2026, 5, 12, 15, 0);
    const out = formatDue(due, true, new Date(now));
    expect(out).toBe("jun 12 3pm");
  });

  it("returns empty string for null", () => {
    expect(formatDue(null, false)).toBe("");
  });
});

describe("dueToInputs / inputsToDue round-trip", () => {
  it("splits a timestamp into date and time inputs", () => {
    const due = at(2026, 5, 12, 9, 30);
    const { date, time } = dueToInputs(due, true);
    expect(date).toBe("2026-06-12");
    expect(time).toBe("09:30");
  });

  it("omits time when dueHasTime is false", () => {
    const due = at(2026, 5, 12);
    const { date, time } = dueToInputs(due, false);
    expect(date).toBe("2026-06-12");
    expect(time).toBe("");
  });

  it("rebuilds a timestamp from date + time", () => {
    const { due, dueHasTime } = inputsToDue("2026-06-12", "09:30");
    expect(dueHasTime).toBe(true);
    expect(dueToInputs(due!, true)).toEqual({ date: "2026-06-12", time: "09:30" });
  });

  it("rebuilds a date-only timestamp when time is empty", () => {
    const { due, dueHasTime } = inputsToDue("2026-06-12", "");
    expect(dueHasTime).toBe(false);
    expect(due).not.toBeNull();
  });

  it("returns null due when date is empty", () => {
    expect(inputsToDue("", "09:30")).toEqual({ due: null, dueHasTime: false });
  });
});
