import { describe, expect, it, beforeEach } from "vitest";
import {
  migrateTaskV1,
  migrateIdeaV1,
  migrateBacklogV1,
  migrateProjectV1,
} from "@/lib/db/migrations";
import Dexie from "dexie";
import { db } from "@/lib/db/schema";

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
    }) as unknown as Record<string, unknown>;
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

  it("nulls due when time is garbage", () => {
    const out = migrateTaskV1({
      id: 9,
      title: "x",
      links: [],
      bucket: "today",
      status: "open",
      order: 0,
      createdAt: 100,
      time: "abc",
      dayKey: "2026-06-02",
    });
    expect(out.due ?? null).toBeNull();
    expect(out.dueHasTime).toBe(false);
  });

  it("nulls due when time is out of range", () => {
    const out = migrateTaskV1({
      id: 10,
      title: "x",
      links: [],
      bucket: "today",
      status: "open",
      order: 0,
      createdAt: 100,
      time: "25:99",
      dayKey: "2026-06-02",
    });
    expect(out.due ?? null).toBeNull();
    expect(out.dueHasTime).toBe(false);
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

describe("Dexie v1 -> v2 in-place upgrade", () => {
  beforeEach(async () => {
    if (db.isOpen()) db.close();
    await Dexie.delete("cadence");
  });

  it("preserves row counts and converts fields without loss", async () => {
    // 1. Seed a v1-shaped database under the production DB name.
    const v1 = new Dexie("cadence");
    v1.version(1).stores({
      projects: "++id, kind, order, archivedAt",
      tasks: "++id, bucket, status, projectId, dayKey, completedAt",
      ideas: "++id, projectId, status",
      backlog: "++id, order",
      meta: "&key",
    });
    await v1.open();
    await v1.table("projects").add({
      name: "HKN",
      kind: "active",
      color: "#A9C8EE",
      order: 0,
      createdAt: 100,
      archivedAt: null,
    });
    await v1.table("tasks").bulkAdd([
      {
        title: "open one",
        links: [],
        projectId: 1,
        bucket: "today",
        status: "open",
        order: 0,
        createdAt: 100,
        time: "15:00",
        dayKey: "2026-06-02",
        carried: false,
        archived: false,
      },
      {
        title: "done one",
        links: ["https://a.com"],
        bucket: "week",
        status: "done",
        order: 1,
        createdAt: 100,
        completedAt: 150,
        archived: false,
      },
    ]);
    await v1.table("ideas").add({
      projectId: 1,
      text: "idea",
      status: "open",
      order: 0,
      createdAt: 100,
    });
    await v1.table("backlog").add({
      title: "parked",
      order: 0,
      createdAt: 100,
      promotedProjectId: null,
    });
    v1.close();

    // 2. Open the production db (version 2) -> triggers upgrade.
    await db.open();

    // 3. Counts preserved.
    expect(await db.tasks.count()).toBe(2);
    expect(await db.projects.count()).toBe(1);
    expect(await db.ideas.count()).toBe(1);
    expect(await db.backlog.count()).toBe(1);

    // 4. open -> todo, time -> due with hour.
    const open = await db.tasks.where("status").equals("todo").first();
    expect(open?.title).toBe("open one");
    expect(open?.dueHasTime).toBe(true);
    expect(new Date(open!.due!).getHours()).toBe(15);
    expect((open as unknown as Record<string, unknown>).time).toBeUndefined();

    // 5. done preserved.
    const done = await db.tasks.where("status").equals("done").first();
    expect(done?.status).toBe("done");

    // 6. Unique guids across all tasks.
    const tasks = await db.tasks.toArray();
    const guids = new Set(tasks.map((t) => t.guid));
    expect(guids.size).toBe(tasks.length);
    tasks.forEach((t) => expect(typeof t.guid).toBe("string"));

    // 7. New collections gained links/subtasks.
    const idea = await db.ideas.toArray();
    expect(idea[0].links).toEqual([]);
    expect(idea[0].subtasks).toEqual([]);
    expect(idea[0].guid).toBeTruthy();

    // 8. Primary keys survive the upgrade; relations stay intact.
    const byId = await db.tasks.get(1);
    expect(byId?.title).toBe("open one");
    expect(byId?.projectId).toBe(1);
    const project = await db.projects.get(1);
    expect(project?.name).toBe("HKN");
  });
});
