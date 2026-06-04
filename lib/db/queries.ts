import { type Table } from "dexie";
import { db } from "@/lib/db/schema";
import { PROJECT_COLORS } from "@/lib/constants";
import { localDateKey } from "@/lib/date";
import type { Bucket, BacklogItem, Idea, Project, ProjectKind, Task } from "@/lib/types";

// ---------- Projects ----------

export async function addProject(name: string, kind: ProjectKind): Promise<number> {
  const count = await db.projects.count();
  const max = await maxOrder(db.projects);
  const color = PROJECT_COLORS[count % PROJECT_COLORS.length];
  return db.projects.add({
    name: name.trim(),
    kind,
    color,
    order: max + 1,
    createdAt: Date.now(),
    archivedAt: null,
  });
}

export async function updateProject(
  id: number,
  changes: { name?: string; color?: string; kind?: ProjectKind },
): Promise<void> {
  await db.projects.update(id, {
    ...changes,
    ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
  });
}

export async function deleteProject(id: number): Promise<void> {
  await db.transaction("rw", db.projects, db.tasks, db.ideas, async () => {
    await db.ideas.where("projectId").equals(id).delete();
    // Detach tasks rather than delete them.
    const tasks = await db.tasks.where("projectId").equals(id).toArray();
    for (const t of tasks) await db.tasks.update(t.id!, { projectId: null });
    await db.projects.delete(id);
  });
}

// ---------- Tasks ----------

export async function addTask(input: {
  title: string;
  links?: string[];
  projectId?: number | null;
  bucket: Bucket;
  time?: string | null;
}): Promise<number> {
  const max = await maxTaskOrder(input.bucket);
  return db.tasks.add({
    title: input.title.trim(),
    links: input.links ?? [],
    projectId: input.projectId ?? null,
    bucket: input.bucket,
    time: input.time ?? null,
    status: "open",
    order: max + 1,
    createdAt: Date.now(),
    completedAt: null,
    carried: false,
    dayKey: input.bucket === "today" ? localDateKey() : null,
    archived: false,
  });
}

export async function toggleTask(task: Task): Promise<void> {
  const done = task.status === "done";
  await db.tasks.update(task.id!, {
    status: done ? "open" : "done",
    completedAt: done ? null : Date.now(),
  });
}

export async function updateTask(
  id: number,
  changes: { title?: string; projectId?: number | null; time?: string | null },
): Promise<void> {
  await db.tasks.update(id, {
    ...changes,
    ...(changes.title !== undefined ? { title: changes.title.trim() } : {}),
  });
}

export async function moveTask(id: number, bucket: Bucket): Promise<void> {
  const max = await maxTaskOrder(bucket);
  await db.tasks.update(id, {
    bucket,
    order: max + 1,
    dayKey: bucket === "today" ? localDateKey() : null,
  });
}

export async function deleteTask(id: number): Promise<void> {
  await db.tasks.delete(id);
}

export async function reorderTasks(orderedIds: number[]): Promise<void> {
  await db.transaction("rw", db.tasks, async () => {
    await Promise.all(
      orderedIds.map((id, i) => db.tasks.update(id, { order: i })),
    );
  });
}

// ---------- Ideas ----------

export async function addIdea(projectId: number, text: string): Promise<number> {
  const max = await maxOrderWhere(db.ideas, "projectId", projectId);
  return db.ideas.add({
    projectId,
    text: text.trim(),
    status: "open",
    order: max + 1,
    createdAt: Date.now(),
  });
}

export async function updateIdeaText(id: number, text: string): Promise<void> {
  await db.ideas.update(id, { text: text.trim() });
}

export async function deleteIdea(id: number): Promise<void> {
  await db.ideas.delete(id);
}

export async function reorderIdeas(orderedIds: number[]): Promise<void> {
  await db.transaction("rw", db.ideas, async () => {
    await Promise.all(
      orderedIds.map((id, i) => db.ideas.update(id, { order: i })),
    );
  });
}

/** Promote an idea into a real task in the chosen bucket. */
export async function promoteIdeaToTask(
  idea: Idea,
  bucket: Bucket,
): Promise<void> {
  await db.transaction("rw", db.tasks, db.ideas, async () => {
    await addTask({ title: idea.text, projectId: idea.projectId, bucket });
    await db.ideas.update(idea.id!, { status: "promoted" });
  });
}

// ---------- Backlog (Histórico) ----------

export async function addBacklog(title: string, note?: string): Promise<number> {
  const max = await maxOrder(db.backlog);
  return db.backlog.add({
    title: title.trim(),
    note: note?.trim() || undefined,
    order: max + 1,
    createdAt: Date.now(),
    promotedProjectId: null,
  });
}

export async function deleteBacklog(id: number): Promise<void> {
  await db.backlog.delete(id);
}

/** Promote a parked Histórico idea into a full project. */
export async function promoteBacklogToProject(
  item: BacklogItem,
  kind: ProjectKind = "active",
): Promise<number> {
  let projectId = 0;
  await db.transaction("rw", db.projects, db.backlog, async () => {
    projectId = await addProject(item.title, kind);
    await db.backlog.delete(item.id!);
  });
  return projectId;
}

// ---------- helpers ----------

async function maxOrder<T extends { order: number }>(
  table: Table<T, number>,
): Promise<number> {
  const last = await table.orderBy("order").last();
  return last?.order ?? 0;
}

async function maxOrderWhere(
  table: Table<Idea, number>,
  index: "projectId",
  value: number,
): Promise<number> {
  const rows = await table.where(index).equals(value).toArray();
  return rows.reduce((m, r) => Math.max(m, r.order), 0);
}

async function maxTaskOrder(bucket: Bucket): Promise<number> {
  const rows = await db.tasks.where("bucket").equals(bucket).toArray();
  return rows.reduce((m, r) => Math.max(m, r.order), 0);
}

export type { Project };
