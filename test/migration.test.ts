import { describe, expect, it } from "vitest";
import {
  migrateTaskV1,
  migrateIdeaV1,
  migrateBacklogV1,
  migrateProjectV1,
} from "@/lib/db/migrations";

describe("migrateTaskV1", () => {
  it("maps open -> todo", () => {
    const out = migrateTaskV1({
      id: 1,
      title: "x",
      links: [],
      bucket: "today",
      status: "open",
      order: 0,
      createdAt: 100,
    });
    expect(out.status).toBe("todo");
  });

  it("maps done -> done", () => {
    const out = migrateTaskV1({
      id: 2,
      title: "x",
      links: [],
      bucket: "today",
      status: "done",
      order: 0,
      createdAt: 100,
    });
    expect(out.status).toBe("done");
  });

  it("converts a today task with time into a dated due with hour", () => {
    const out = migrateTaskV1({
      id: 3,
      title: "x",
      links: [],
      bucket: "today",
      status: "open",
      order: 0,
      createdAt: 100,
      time: "15:00",
      dayKey: "2026-06-02",
    });
    const d = new Date(out.due!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June (0-based)
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(0);
    expect(out.dueHasTime).toBe(true);
  });

  it("drops the time field after migration", () => {
    const out = migrateTaskV1({
      id: 4,
      title: "x",
      links: [],
      bucket: "today",
      status: "open",
      order: 0,
      createdAt: 100,
      time: "09:30",
      dayKey: "2026-06-02",
    }) as Record<string, unknown>;
    expect("time" in out).toBe(false);
  });

  it("leaves due null when there was no time", () => {
    const out = migrateTaskV1({
      id: 5,
      title: "x",
      links: [],
      bucket: "week",
      status: "open",
      order: 0,
      createdAt: 100,
    });
    expect(out.due ?? null).toBeNull();
    expect(out.dueHasTime).toBe(false);
  });

  it("falls back to today's date when time exists without dayKey", () => {
    const out = migrateTaskV1({
      id: 6,
      title: "x",
      links: [],
      bucket: "today",
      status: "open",
      order: 0,
      createdAt: 100,
      time: "08:00",
    });
    expect(out.due).not.toBeNull();
    expect(out.dueHasTime).toBe(true);
  });

  it("adds a guid, updatedAt, empty subtasks and null deletedAt", () => {
    const out = migrateTaskV1({
      id: 7,
      title: "x",
      links: [],
      bucket: "today",
      status: "open",
      order: 0,
      createdAt: 100,
    });
    expect(out.guid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(typeof out.updatedAt).toBe("number");
    expect(out.subtasks).toEqual([]);
    expect(out.deletedAt ?? null).toBeNull();
  });

  it("preserves existing fields (links, order, carried, archived)", () => {
    const out = migrateTaskV1({
      id: 8,
      title: "keep me",
      links: ["https://a.com"],
      bucket: "tomorrow",
      status: "open",
      order: 5,
      createdAt: 100,
      carried: true,
      archived: true,
      archivedAt: 200,
      completedAt: null,
    });
    expect(out.title).toBe("keep me");
    expect(out.links).toEqual(["https://a.com"]);
    expect(out.order).toBe(5);
    expect(out.carried).toBe(true);
    expect(out.archived).toBe(true);
    expect(out.archivedAt).toBe(200);
  });
});

describe("migrateIdeaV1", () => {
  it("adds links, subtasks, guid, updatedAt and keeps text/status", () => {
    const out = migrateIdeaV1({
      id: 1,
      projectId: 9,
      text: "an idea",
      status: "open",
      order: 2,
      createdAt: 100,
    });
    expect(out.text).toBe("an idea");
    expect(out.status).toBe("open");
    expect(out.projectId).toBe(9);
    expect(out.links).toEqual([]);
    expect(out.subtasks).toEqual([]);
    expect(out.guid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(typeof out.updatedAt).toBe("number");
    expect(out.deletedAt ?? null).toBeNull();
  });
});

describe("migrateBacklogV1", () => {
  it("adds links, subtasks, guid, updatedAt and keeps title/note", () => {
    const out = migrateBacklogV1({
      id: 1,
      title: "future",
      note: "a note",
      order: 0,
      createdAt: 100,
      promotedProjectId: null,
    });
    expect(out.title).toBe("future");
    expect(out.note).toBe("a note");
    expect(out.links).toEqual([]);
    expect(out.subtasks).toEqual([]);
    expect(out.guid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(out.deletedAt ?? null).toBeNull();
  });
});

describe("migrateProjectV1", () => {
  it("adds guid, updatedAt and null deletedAt, keeps name/kind/color", () => {
    const out = migrateProjectV1({
      id: 1,
      name: "HKN",
      kind: "active",
      color: "#A9C8EE",
      order: 0,
      createdAt: 100,
      archivedAt: null,
    });
    expect(out.name).toBe("HKN");
    expect(out.kind).toBe("active");
    expect(out.color).toBe("#A9C8EE");
    expect(out.guid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(typeof out.updatedAt).toBe("number");
    expect(out.deletedAt ?? null).toBeNull();
  });
});
