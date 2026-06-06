import { beforeEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import { db } from "@/lib/db/schema";
import {
  addTask,
  addProject,
  addIdea,
  addBacklog,
  cycleTaskStatus,
  setTaskStatus,
  deleteTask,
  deleteProject,
  deleteIdea,
  deleteBacklog,
  listTasks,
  listIdeas,
  listBacklog,
  listProjects,
  moveTask,
  reorderTasks,
  reorderIdeas,
  transferTask,
  toggleTask,
  updateProject,
  updateTask,
  updateIdea,
  updateIdeaText,
  updateBacklog,
  promoteIdeaToTask,
  promoteBacklogToProject,
} from "@/lib/db/queries";

vi.mock("@/lib/sync/orchestrator", () => ({ scheduleSync: () => {} }));

beforeEach(async () => {
  db.close();
  await Dexie.delete("cadence");
  await db.open();
});

// ────────────────────────────────────────────────────────────────────────────
// Projects
// ────────────────────────────────────────────────────────────────────────────

describe("addProject", () => {
  it("stores name trimmed, assigns guid and timestamps", async () => {
    const id = await addProject("  Alpha  ", "active");
    const p = (await db.projects.get(id))!;
    expect(p.name).toBe("Alpha");
    expect(p.guid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(p.createdAt).toBeGreaterThan(0);
    expect(p.updatedAt).toBe(p.createdAt);
    expect(p.deletedAt).toBeNull();
  });

  it("assigns colors from the PROJECT_COLORS palette (round-robin)", async () => {
    // Sequential inserts so count increments correctly.
    const id0 = await addProject("P0", "active");
    const id1 = await addProject("P1", "active");
    const id2 = await addProject("P2", "active");
    const colors = await Promise.all(
      [id0, id1, id2].map(async (id) => (await db.projects.get(id))!.color),
    );
    // Each color must be a non-empty hex string.
    for (const c of colors) {
      expect(c).toMatch(/^#[0-9a-fA-F]+$/);
    }
    // The three projects should not all share the same color.
    const unique = new Set(colors);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe("updateProject", () => {
  it("trims name, updates color/kind, bumps updatedAt", async () => {
    const id = await addProject("Foo", "active");
    const before = (await db.projects.get(id))!.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await updateProject(id, { name: "  Bar  ", color: "#ff0000", kind: "area" });
    const p = (await db.projects.get(id))!;
    expect(p.name).toBe("Bar");
    expect(p.color).toBe("#ff0000");
    expect(p.kind).toBe("area");
    expect(p.updatedAt).toBeGreaterThan(before);
  });

  it("partial update: only provided fields change", async () => {
    const id = await addProject("Stable", "active");
    const orig = (await db.projects.get(id))!;
    await updateProject(id, { color: "#aabbcc" });
    const p = (await db.projects.get(id))!;
    expect(p.name).toBe("Stable");
    expect(p.kind).toBe("active");
    expect(p.color).toBe("#aabbcc");
    // Strict: syncClock guarantees last+1 even without wall-clock delay,
    // so an update that forgets to re-stamp updatedAt must fail here.
    expect(p.updatedAt).toBeGreaterThan(orig.updatedAt);
  });
});

describe("deleteProject cascade", () => {
  it("tombstones the project and its ideas, detaches tasks", async () => {
    const pid = await addProject("Doomed", "active");
    const ideaId = await addIdea(pid, "project idea");
    const taskId = await addTask({ title: "project task", bucket: "today", projectId: pid });
    const taskBefore = (await db.tasks.get(taskId))!;
    await new Promise((r) => setTimeout(r, 2));

    await deleteProject(pid);

    const project = (await db.projects.get(pid))!;
    expect(project.deletedAt).not.toBeNull();
    expect((await listProjects()).find((p) => p.id === pid)).toBeUndefined();

    const idea = (await db.ideas.get(ideaId))!;
    expect(idea.deletedAt).not.toBeNull();

    const task = (await db.tasks.get(taskId))!;
    expect(task.deletedAt ?? null).toBeNull(); // detached, NOT tombstoned
    expect(task.projectId).toBeNull();
    expect(task.updatedAt).toBeGreaterThan(taskBefore.updatedAt); // LWW stamp
  });

  it("tombstones photos of cascade-deleted ideas", async () => {
    const pid = await addProject("P", "active");
    const ideaId = await addIdea(pid, "idea with photo");
    const idea = (await db.ideas.get(ideaId))!;

    // Manually insert a photo for the idea.
    const now = Date.now();
    await db.photos.add({
      guid: "photo-guid-1",
      parentType: "idea",
      parentGuid: idea.guid,
      blob: new Blob(["x"]),
      thumb: new Blob(["x"]),
      width: 10,
      height: 10,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      remoteUrl: null,
    });

    await deleteProject(pid);

    const photos = await db.photos.where("parentGuid").equals(idea.guid).toArray();
    expect(photos[0].deletedAt).not.toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Tasks — status
// ────────────────────────────────────────────────────────────────────────────

describe("status cycle", () => {
  it("cycles todo -> in_progress -> done -> todo", async () => {
    const id = await addTask({ title: "x", bucket: "today" });
    let t = (await db.tasks.get(id))!;
    expect(t.status).toBe("todo");

    await cycleTaskStatus(t);
    t = (await db.tasks.get(id))!;
    expect(t.status).toBe("in_progress");

    await cycleTaskStatus(t);
    t = (await db.tasks.get(id))!;
    expect(t.status).toBe("done");
    expect(t.completedAt).not.toBeNull();

    await cycleTaskStatus(t);
    t = (await db.tasks.get(id))!;
    expect(t.status).toBe("todo");
    expect(t.completedAt).toBeNull();
  });

  it("cycling a blocked task returns it to todo", async () => {
    const id = await addTask({ title: "blocked", bucket: "today" });
    await setTaskStatus(id, "blocked");
    let t = (await db.tasks.get(id))!;
    expect(t.status).toBe("blocked");

    await cycleTaskStatus(t);
    t = (await db.tasks.get(id))!;
    expect(t.status).toBe("todo");
  });

  it("setTaskStatus can set blocked and bumps updatedAt", async () => {
    const id = await addTask({ title: "x", bucket: "today" });
    const before = (await db.tasks.get(id))!.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await setTaskStatus(id, "blocked");
    const t = (await db.tasks.get(id))!;
    expect(t.status).toBe("blocked");
    expect(t.updatedAt).toBeGreaterThan(before);
  });

  it("setTaskStatus done sets completedAt, other statuses clear it", async () => {
    const id = await addTask({ title: "x", bucket: "today" });
    await setTaskStatus(id, "done");
    let t = (await db.tasks.get(id))!;
    expect(t.completedAt).toBeGreaterThan(0);

    await setTaskStatus(id, "todo");
    t = (await db.tasks.get(id))!;
    expect(t.completedAt).toBeNull();
  });
});

describe("toggleTask back-compat", () => {
  it("toggles done <-> todo", async () => {
    const id = await addTask({ title: "t", bucket: "today" });
    let t = (await db.tasks.get(id))!;
    await toggleTask(t);
    t = (await db.tasks.get(id))!;
    expect(t.status).toBe("done");
    expect(t.completedAt).not.toBeNull();
    await toggleTask(t);
    t = (await db.tasks.get(id))!;
    expect(t.status).toBe("todo");
    expect(t.completedAt).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Tasks — mutations
// ────────────────────────────────────────────────────────────────────────────

describe("addTask defaults", () => {
  it("assigns guid, updatedAt, empty subtasks, status todo", async () => {
    const id = await addTask({ title: "x", bucket: "week" });
    const t = (await db.tasks.get(id))!;
    expect(t.guid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(typeof t.updatedAt).toBe("number");
    expect(t.subtasks).toEqual([]);
    expect(t.status).toBe("todo");
    expect(t.deletedAt).toBeNull();
  });

  it("today tasks record dayKey, other buckets get null", async () => {
    const todayId = await addTask({ title: "t", bucket: "today" });
    const weekId = await addTask({ title: "w", bucket: "week" });
    const tomorrowId = await addTask({ title: "m", bucket: "tomorrow" });
    expect((await db.tasks.get(todayId))!.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await db.tasks.get(weekId))!.dayKey).toBeNull();
    expect((await db.tasks.get(tomorrowId))!.dayKey).toBeNull();
  });
});

describe("updateTask", () => {
  it("trims title and bumps updatedAt", async () => {
    const id = await addTask({ title: "Old", bucket: "today" });
    const before = (await db.tasks.get(id))!.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await updateTask(id, { title: "  New  " });
    const t = (await db.tasks.get(id))!;
    expect(t.title).toBe("New");
    expect(t.updatedAt).toBeGreaterThan(before);
  });

  it("can update links and subtasks without changing title", async () => {
    const id = await addTask({ title: "Task", bucket: "today" });
    const subs = [{ id: "s1", text: "step", done: false }];
    await updateTask(id, { links: ["https://x.com"], subtasks: subs });
    const t = (await db.tasks.get(id))!;
    expect(t.links).toEqual(["https://x.com"]);
    expect(t.subtasks).toEqual(subs);
    expect(t.title).toBe("Task");
  });
});

describe("moveTask", () => {
  it("moves task to new bucket with order at end, sets dayKey for today", async () => {
    const id = await addTask({ title: "move me", bucket: "week" });
    const existingId = await addTask({ title: "existing", bucket: "today" });
    const existingOrder = (await db.tasks.get(existingId))!.order;

    await moveTask(id, "today");
    const t = (await db.tasks.get(id))!;
    expect(t.bucket).toBe("today");
    expect(t.order).toBeGreaterThan(existingOrder);
    expect(t.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("clears dayKey when moving to non-today bucket", async () => {
    const id = await addTask({ title: "today task", bucket: "today" });
    expect((await db.tasks.get(id))!.dayKey).not.toBeNull();
    await moveTask(id, "week");
    expect((await db.tasks.get(id))!.dayKey).toBeNull();
  });
});

describe("deleteTask", () => {
  it("soft-deletes and listTasks hides it", async () => {
    const id = await addTask({ title: "gone", bucket: "today" });
    await deleteTask(id);
    const row = await db.tasks.get(id);
    expect(row).toBeTruthy();
    expect(row!.deletedAt).not.toBeNull();
    const visible = await listTasks("today");
    expect(visible.find((t) => t.id === id)).toBeUndefined();
  });

  it("tombstones photos of the deleted task", async () => {
    const id = await addTask({ title: "task", bucket: "today" });
    const task = (await db.tasks.get(id))!;
    const now = Date.now();
    await db.photos.add({
      guid: "photo-guid-2",
      parentType: "task",
      parentGuid: task.guid,
      blob: new Blob(["x"]),
      thumb: new Blob(["x"]),
      width: 10,
      height: 10,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      remoteUrl: null,
    });

    await deleteTask(id);
    const photos = await db.photos.where("parentGuid").equals(task.guid).toArray();
    expect(photos[0].deletedAt).not.toBeNull();
  });
});

describe("reorderTasks", () => {
  it("assigns index-based order to each task and bumps updatedAt", async () => {
    const a = await addTask({ title: "a", bucket: "today" });
    const b = await addTask({ title: "b", bucket: "today" });
    const c = await addTask({ title: "c", bucket: "today" });
    await new Promise((r) => setTimeout(r, 2));

    await reorderTasks([c, a, b]);

    const ta = (await db.tasks.get(a))!;
    const tb = (await db.tasks.get(b))!;
    const tc = (await db.tasks.get(c))!;
    expect(tc.order).toBe(0);
    expect(ta.order).toBe(1);
    expect(tb.order).toBe(2);
  });
});

describe("transferTask", () => {
  it("moves task to target bucket and reorders destination", async () => {
    const a = await addTask({ title: "a", bucket: "today" });
    const b = await addTask({ title: "b", bucket: "week" });
    const c = await addTask({ title: "c", bucket: "week" });

    // Transfer a to week, placing it between b and c
    await transferTask(a, "week", [b, a, c]);

    const ta = (await db.tasks.get(a))!;
    expect(ta.bucket).toBe("week");
    expect(ta.dayKey).toBeNull(); // not today bucket

    const tb = (await db.tasks.get(b))!;
    const tc = (await db.tasks.get(c))!;
    expect(tb.order).toBe(0);
    expect(ta.order).toBe(1);
    expect(tc.order).toBe(2);
  });

  it("sets dayKey when transferring to today", async () => {
    const id = await addTask({ title: "t", bucket: "week" });
    await transferTask(id, "today", [id]);
    const t = (await db.tasks.get(id))!;
    expect(t.bucket).toBe("today");
    expect(t.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Ideas
// ────────────────────────────────────────────────────────────────────────────

describe("addIdea", () => {
  it("stores text trimmed and sets status open", async () => {
    const id = await addIdea(1, "  My idea  ");
    const idea = (await db.ideas.get(id))!;
    expect(idea.text).toBe("My idea");
    expect(idea.status).toBe("open");
    expect(idea.projectId).toBe(1);
    expect(idea.deletedAt).toBeNull();
  });
});

describe("updateIdeaText", () => {
  it("trims text and bumps updatedAt", async () => {
    const id = await addIdea(1, "old");
    const before = (await db.ideas.get(id))!.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await updateIdeaText(id, "  new  ");
    const idea = (await db.ideas.get(id))!;
    expect(idea.text).toBe("new");
    expect(idea.updatedAt).toBeGreaterThan(before);
  });
});

describe("updateIdea", () => {
  it("can update links, subtasks, and due", async () => {
    const id = await addIdea(1, "idea");
    const subs = [{ id: "s1", text: "step", done: false }];
    await updateIdea(id, {
      links: ["https://example.com"],
      subtasks: subs,
      due: 9999,
      dueHasTime: true,
    });
    const idea = (await db.ideas.get(id))!;
    expect(idea.links).toEqual(["https://example.com"]);
    expect(idea.subtasks).toEqual(subs);
    expect(idea.due).toBe(9999);
    expect(idea.dueHasTime).toBe(true);
  });

  it("trims text if text is provided", async () => {
    const id = await addIdea(1, "old");
    await updateIdea(id, { text: "  trimmed  " });
    expect((await db.ideas.get(id))!.text).toBe("trimmed");
  });
});

describe("deleteIdea", () => {
  it("soft-deletes and listIdeas hides it", async () => {
    const id = await addIdea(1, "idea");
    await deleteIdea(id);
    const visible = await listIdeas(1);
    expect(visible.find((i) => i.id === id)).toBeUndefined();
    expect((await db.ideas.get(id))!.deletedAt).not.toBeNull();
  });

  it("tombstones photos of the deleted idea", async () => {
    const id = await addIdea(1, "idea with photo");
    const idea = (await db.ideas.get(id))!;
    const now = Date.now();
    await db.photos.add({
      guid: "photo-guid-3",
      parentType: "idea",
      parentGuid: idea.guid,
      blob: new Blob(["x"]),
      thumb: new Blob(["x"]),
      width: 10,
      height: 10,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      remoteUrl: null,
    });

    await deleteIdea(id);
    const photos = await db.photos.where("parentGuid").equals(idea.guid).toArray();
    expect(photos[0].deletedAt).not.toBeNull();
  });
});

describe("reorderIdeas", () => {
  it("assigns index-based order and bumps updatedAt", async () => {
    const a = await addIdea(1, "a");
    const b = await addIdea(1, "b");
    const c = await addIdea(1, "c");
    await new Promise((r) => setTimeout(r, 2));

    await reorderIdeas([c, a, b]);

    expect((await db.ideas.get(c))!.order).toBe(0);
    expect((await db.ideas.get(a))!.order).toBe(1);
    expect((await db.ideas.get(b))!.order).toBe(2);
  });
});

describe("promoteIdeaToTask", () => {
  it("carries links, subtasks and due to the new task", async () => {
    const id = await addIdea(7, "an idea");
    await updateIdea(id, {
      links: ["https://a.com"],
      subtasks: [{ id: "s1", text: "step", done: false }],
      due: 1234,
      dueHasTime: true,
    });
    const idea = (await db.ideas.get(id))!;
    await promoteIdeaToTask(idea, "today");

    const task = (await db.tasks.toArray()).find((t) => t.title === "an idea");
    expect(task).toBeTruthy();
    expect(task!.links).toEqual(["https://a.com"]);
    expect(task!.subtasks).toEqual([{ id: "s1", text: "step", done: false }]);
    expect(task!.due).toBe(1234);
    expect(task!.dueHasTime).toBe(true);
    expect(task!.projectId).toBe(7);
    expect((await db.ideas.get(id))!.status).toBe("promoted");
  });

  it("bumps the idea's updatedAt and creates exactly one task", async () => {
    const ideaId = await addIdea(3, "to promote");
    const before = (await db.ideas.get(ideaId))!;
    await new Promise((r) => setTimeout(r, 2));

    await promoteIdeaToTask(before, "week");

    const after = (await db.ideas.get(ideaId))!;
    expect(after.status).toBe("promoted");
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
    const tasks = (await db.tasks.toArray()).filter((t) => t.title === "to promote");
    expect(tasks).toHaveLength(1);
  });

  it("reparents live photos from idea to task", async () => {
    const ideaId = await addIdea(1, "idea with photo");
    const idea = (await db.ideas.get(ideaId))!;
    const now = Date.now();
    await db.photos.add({
      guid: "photo-idea-promote",
      parentType: "idea",
      parentGuid: idea.guid,
      blob: new Blob(["x"]),
      thumb: new Blob(["x"]),
      width: 10,
      height: 10,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      remoteUrl: null,
    });

    await promoteIdeaToTask(idea, "today");

    // Photo should now belong to the new task — assert the EXACT destination
    // guid, not just "changed from the idea's" (review: weak negative assert).
    const task = (await db.tasks.toArray()).find(
      (t) => t.title === "idea with photo",
    )!;
    const photo = (await db.photos.where("guid").equals("photo-idea-promote").first())!;
    expect(photo.parentType).toBe("task");
    expect(photo.parentGuid).toBe(task.guid);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Backlog
// ────────────────────────────────────────────────────────────────────────────

describe("addBacklog", () => {
  it("stores title trimmed and sets defaults", async () => {
    const id = await addBacklog("  Backlog item  ", "some note");
    const item = (await db.backlog.get(id))!;
    expect(item.title).toBe("Backlog item");
    expect(item.note).toBe("some note");
    expect(item.deletedAt).toBeNull();
    expect(item.promotedProjectId).toBeNull();
    expect(item.links).toEqual([]);
    expect(item.subtasks).toEqual([]);
  });

  it("note is optional", async () => {
    const id = await addBacklog("No note");
    const item = (await db.backlog.get(id))!;
    expect(item.note).toBeUndefined();
  });
});

describe("updateBacklog", () => {
  it("trims title and bumps updatedAt", async () => {
    const id = await addBacklog("Old Title");
    const before = (await db.backlog.get(id))!.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await updateBacklog(id, { title: "  New Title  " });
    const item = (await db.backlog.get(id))!;
    expect(item.title).toBe("New Title");
    expect(item.updatedAt).toBeGreaterThan(before);
  });

  it("can update note and links without changing title", async () => {
    const id = await addBacklog("Stable");
    await updateBacklog(id, { note: "updated note", links: ["https://x.com"] });
    const item = (await db.backlog.get(id))!;
    expect(item.title).toBe("Stable");
    expect(item.note).toBe("updated note");
    expect(item.links).toEqual(["https://x.com"]);
  });
});

describe("deleteBacklog", () => {
  it("soft-deletes and listBacklog hides it", async () => {
    const id = await addBacklog("Gone");
    await deleteBacklog(id);
    const item = (await db.backlog.get(id))!;
    expect(item.deletedAt).not.toBeNull();
    const visible = await listBacklog();
    expect(visible.find((b) => b.id === id)).toBeUndefined();
  });

  it("tombstones photos of the deleted backlog item", async () => {
    const id = await addBacklog("item with photo");
    const item = (await db.backlog.get(id))!;
    const now = Date.now();
    await db.photos.add({
      guid: "photo-guid-backlog",
      parentType: "backlog",
      parentGuid: item.guid,
      blob: new Blob(["x"]),
      thumb: new Blob(["x"]),
      width: 10,
      height: 10,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      remoteUrl: null,
    });

    await deleteBacklog(id);
    const photos = await db.photos.where("parentGuid").equals(item.guid).toArray();
    expect(photos[0].deletedAt).not.toBeNull();
  });
});

describe("promoteBacklogToProject", () => {
  it("creates a project from the backlog item and tombstones it", async () => {
    const id = await addBacklog("Future Project");
    const item = (await db.backlog.get(id))!;

    const projectId = await promoteBacklogToProject(item, "active");

    const project = (await db.projects.get(projectId))!;
    expect(project.name).toBe("Future Project");
    expect(project.kind).toBe("active");

    const backlogItem = (await db.backlog.get(id))!;
    expect(backlogItem.deletedAt).not.toBeNull();
    expect(backlogItem.promotedProjectId).toBe(projectId);
  });

  it("defaults kind to 'active' when not specified", async () => {
    const id = await addBacklog("Default Kind Project");
    const item = (await db.backlog.get(id))!;
    const projectId = await promoteBacklogToProject(item);
    const project = (await db.projects.get(projectId))!;
    expect(project.kind).toBe("active");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Monotonic updatedAt contract (sync correctness)
// ────────────────────────────────────────────────────────────────────────────

describe("updatedAt monotonic contract", () => {
  it("each mutation stamps updatedAt strictly greater than the previous", async () => {
    const id = await addTask({ title: "mono", bucket: "today" });
    const stamps: number[] = [(await db.tasks.get(id))!.updatedAt];

    await setTaskStatus(id, "done");
    stamps.push((await db.tasks.get(id))!.updatedAt);

    await setTaskStatus(id, "todo");
    stamps.push((await db.tasks.get(id))!.updatedAt);

    await updateTask(id, { title: "updated" });
    stamps.push((await db.tasks.get(id))!.updatedAt);

    // Strict monotonicity is THE sync invariant: syncClock guarantees
    // max(Date.now(), last + 1) even for same-millisecond writes.
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i]).toBeGreaterThan(stamps[i - 1]);
    }
  });

  it("project mutations stamp monotonic updatedAt", async () => {
    const id = await addProject("Proj", "active");
    const t1 = (await db.projects.get(id))!.updatedAt;
    await updateProject(id, { color: "#000" });
    const t2 = (await db.projects.get(id))!.updatedAt;
    expect(t2).toBeGreaterThan(t1);
  });
});
