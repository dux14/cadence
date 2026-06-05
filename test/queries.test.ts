import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { db } from "@/lib/db/schema";
import {
  addTask,
  cycleTaskStatus,
  setTaskStatus,
  deleteTask,
  listTasks,
  addIdea,
  promoteIdeaToTask,
  updateIdea,
  deleteIdea,
  listIdeas,
  deleteProject,
  addProject,
  toggleTask,
  listProjects,
} from "@/lib/db/queries";

beforeEach(async () => {
  db.close();
  await Dexie.delete("cadence");
  await db.open();
});

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

  it("setTaskStatus can set blocked and bumps updatedAt", async () => {
    const id = await addTask({ title: "x", bucket: "today" });
    const before = (await db.tasks.get(id))!.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await setTaskStatus(id, "blocked");
    const t = (await db.tasks.get(id))!;
    expect(t.status).toBe("blocked");
    expect(t.updatedAt).toBeGreaterThan(before);
  });
});

describe("tombstones", () => {
  it("deleteTask soft-deletes and listTasks hides it", async () => {
    const id = await addTask({ title: "gone", bucket: "today" });
    await deleteTask(id);
    const row = await db.tasks.get(id);
    expect(row).toBeTruthy();
    expect(row!.deletedAt).not.toBeNull();
    const visible = await listTasks("today");
    expect(visible.find((t) => t.id === id)).toBeUndefined();
  });

  it("deleteIdea soft-deletes and listIdeas hides it", async () => {
    const id = await addIdea(1, "idea");
    await deleteIdea(id);
    const visible = await listIdeas(1);
    expect(visible.find((i) => i.id === id)).toBeUndefined();
    expect((await db.ideas.get(id))!.deletedAt).not.toBeNull();
  });
});

describe("promoteIdeaToTask transfers content", () => {
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
});

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
});

describe("promoteIdeaToTask side effects", () => {
  it("bumps the idea's updatedAt and creates exactly one task", async () => {
    const ideaId = await addIdea(3, "to promote");
    const before = (await db.ideas.get(ideaId))!;
    await new Promise((r) => setTimeout(r, 2));

    await promoteIdeaToTask(before, "week");

    const after = (await db.ideas.get(ideaId))!;
    expect(after.status).toBe("promoted");
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt); // LWW stamp
    const tasks = (await db.tasks.toArray()).filter((t) => t.title === "to promote");
    expect(tasks).toHaveLength(1);
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
