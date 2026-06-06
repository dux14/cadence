import { type Table } from "dexie";
import { syncClock } from "@/lib/db/clock";
import { db } from "@/lib/db/schema";
import { reparentPhotos, tombstonePhotosForParent } from "@/lib/db/photos";
import { PROJECT_COLORS } from "@/lib/constants";
import { localDateKey } from "@/lib/date";
import { newGuid } from "@/lib/id";
import type {
  Bucket,
  BacklogItem,
  Idea,
  Project,
  ProjectKind,
  Subtask,
  Task,
  TaskStatus,
} from "@/lib/types";

/** Fresh updatedAt stamp for any local write (sync-ready). */
function touch(): number {
  return syncClock();
}

// ---------- Projects ----------

export async function addProject(name: string, kind: ProjectKind): Promise<number> {
  const count = await db.projects.count();
  const max = await maxOrder(db.projects);
  const color = PROJECT_COLORS[count % PROJECT_COLORS.length];
  const now = touch();
  return db.projects.add({
    guid: newGuid(),
    name: name.trim(),
    kind,
    color,
    order: max + 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    deletedAt: null,
  });
}

export async function updateProject(
  id: number,
  changes: { name?: string; color?: string; kind?: ProjectKind },
): Promise<void> {
  await db.projects.update(id, {
    ...changes,
    ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
    updatedAt: touch(),
  });
}

export async function listProjects(): Promise<Project[]> {
  const rows = await db.projects.orderBy("order").toArray();
  return rows.filter((p) => p.deletedAt == null);
}

export async function deleteProject(id: number): Promise<void> {
  const now = touch();
  await db.transaction("rw", db.projects, db.tasks, db.ideas, db.photos, async () => {
    const ideas = await db.ideas.where("projectId").equals(id).toArray();
    for (const i of ideas) {
      await db.ideas.update(i.id!, { deletedAt: now, updatedAt: now });
      // Cascade: photos of tombstoned ideas die with them.
      await tombstonePhotosForParent(i.guid);
    }
    // Detach tasks rather than tombstone them; their photos travel with them.
    const tasks = await db.tasks.where("projectId").equals(id).toArray();
    for (const t of tasks)
      await db.tasks.update(t.id!, { projectId: null, updatedAt: now });
    await db.projects.update(id, { deletedAt: now, updatedAt: now });
  });
}

// ---------- Tasks ----------

export async function addTask(input: {
  title: string;
  links?: string[];
  subtasks?: Subtask[];
  projectId?: number | null;
  bucket: Bucket;
  due?: number | null;
  dueHasTime?: boolean;
}): Promise<number> {
  const max = await maxTaskOrder(input.bucket);
  const now = touch();
  return db.tasks.add({
    guid: newGuid(),
    title: input.title.trim(),
    links: input.links ?? [],
    subtasks: input.subtasks ?? [],
    projectId: input.projectId ?? null,
    bucket: input.bucket,
    due: input.due ?? null,
    dueHasTime: input.dueHasTime ?? false,
    status: "todo",
    order: max + 1,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    carried: false,
    dayKey: input.bucket === "today" ? localDateKey() : null,
    archived: false,
    deletedAt: null,
  });
}

export async function listTasks(bucket: Bucket): Promise<Task[]> {
  const rows = await db.tasks.where("bucket").equals(bucket).toArray();
  return rows.filter((t) => t.deletedAt == null && !t.archived);
}

const STATUS_CYCLE: TaskStatus[] = ["todo", "in_progress", "done"];

/** Tap-cycle a task through todo -> in_progress -> done -> todo. */
export async function cycleTaskStatus(task: Task): Promise<void> {
  const i = STATUS_CYCLE.indexOf(task.status);
  // blocked is off-cycle; tapping a blocked task returns it to todo.
  const next = i === -1 ? "todo" : STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
  await setTaskStatus(task.id!, next);
}

/** Explicit status set (used by the sheet selector, incl. blocked). */
export async function setTaskStatus(id: number, status: TaskStatus): Promise<void> {
  await db.tasks.update(id, {
    status,
    completedAt: status === "done" ? Date.now() : null,
    updatedAt: touch(),
  });
}

/** Back-compat alias for the old binary toggle (toggles done <-> todo). */
export async function toggleTask(task: Task): Promise<void> {
  await setTaskStatus(task.id!, task.status === "done" ? "todo" : "done");
}

export async function updateTask(
  id: number,
  changes: {
    title?: string;
    projectId?: number | null;
    links?: string[];
    subtasks?: Subtask[];
    due?: number | null;
    dueHasTime?: boolean;
  },
): Promise<void> {
  await db.tasks.update(id, {
    ...changes,
    ...(changes.title !== undefined ? { title: changes.title.trim() } : {}),
    updatedAt: touch(),
  });
}

export async function moveTask(id: number, bucket: Bucket): Promise<void> {
  const max = await maxTaskOrder(bucket);
  await db.tasks.update(id, {
    bucket,
    order: max + 1,
    dayKey: bucket === "today" ? localDateKey() : null,
    updatedAt: touch(),
  });
}

export async function deleteTask(id: number): Promise<void> {
  const now = touch();
  await db.transaction("rw", db.tasks, db.photos, async () => {
    const task = await db.tasks.get(id);
    await db.tasks.update(id, { deletedAt: now, updatedAt: now });
    if (task) await tombstonePhotosForParent(task.guid);
  });
}

export async function reorderTasks(orderedIds: number[]): Promise<void> {
  const now = touch();
  await db.transaction("rw", db.tasks, async () => {
    await Promise.all(
      orderedIds.map((id, i) => db.tasks.update(id, { order: i, updatedAt: now })),
    );
  });
}

/**
 * Mueve una task a otro bucket y reescribe el order de la columna destino
 * según `orderedIds` (los ids que deben quedar en ese bucket, en orden).
 * Usado por el drag horizontal del board desktop.
 */
export async function transferTask(
  id: number,
  toBucket: Bucket,
  orderedIds: number[],
): Promise<void> {
  const now = touch();
  await db.transaction("rw", db.tasks, async () => {
    await db.tasks.update(id, {
      bucket: toBucket,
      dayKey: toBucket === "today" ? localDateKey() : null,
      updatedAt: now,
    });
    await Promise.all(
      orderedIds.map((tid, i) => db.tasks.update(tid, { order: i, updatedAt: now })),
    );
  });
}

// ---------- Ideas ----------

export async function addIdea(projectId: number, text: string): Promise<number> {
  const max = await maxOrderWhere(db.ideas, "projectId", projectId);
  const now = touch();
  return db.ideas.add({
    guid: newGuid(),
    projectId,
    text: text.trim(),
    links: [],
    subtasks: [],
    status: "open",
    order: max + 1,
    createdAt: now,
    updatedAt: now,
    due: null,
    dueHasTime: false,
    deletedAt: null,
  });
}

export async function listIdeas(projectId: number): Promise<Idea[]> {
  const rows = await db.ideas.where("projectId").equals(projectId).toArray();
  return rows.filter((i) => i.deletedAt == null);
}

export async function updateIdeaText(id: number, text: string): Promise<void> {
  await db.ideas.update(id, { text: text.trim(), updatedAt: touch() });
}

export async function updateIdea(
  id: number,
  changes: {
    text?: string;
    links?: string[];
    subtasks?: Subtask[];
    due?: number | null;
    dueHasTime?: boolean;
  },
): Promise<void> {
  await db.ideas.update(id, {
    ...changes,
    ...(changes.text !== undefined ? { text: changes.text.trim() } : {}),
    updatedAt: touch(),
  });
}

export async function deleteIdea(id: number): Promise<void> {
  const now = touch();
  await db.transaction("rw", db.ideas, db.photos, async () => {
    const idea = await db.ideas.get(id);
    await db.ideas.update(id, { deletedAt: now, updatedAt: now });
    if (idea) await tombstonePhotosForParent(idea.guid);
  });
}

export async function reorderIdeas(orderedIds: number[]): Promise<void> {
  const now = touch();
  await db.transaction("rw", db.ideas, async () => {
    await Promise.all(
      orderedIds.map((id, i) => db.ideas.update(id, { order: i, updatedAt: now })),
    );
  });
}

/** Promote an idea into a real task, carrying links/subtasks/due. */
export async function promoteIdeaToTask(idea: Idea, bucket: Bucket): Promise<void> {
  await db.transaction("rw", db.tasks, db.ideas, db.photos, async () => {
    const taskId = await addTask({
      title: idea.text,
      links: idea.links ?? [],
      subtasks: idea.subtasks ?? [],
      projectId: idea.projectId,
      bucket,
      due: idea.due ?? null,
      dueHasTime: idea.dueHasTime ?? false,
    });
    // addTask returns the numeric id; read back for the guid to re-parent photos.
    const task = await db.tasks.get(taskId);
    if (task) await reparentPhotos(idea.guid, "task", task.guid);
    await db.ideas.update(idea.id!, { status: "promoted", updatedAt: touch() });
  });
}

// ---------- Backlog (Histórico) ----------

export async function addBacklog(title: string, note?: string): Promise<number> {
  const max = await maxOrder(db.backlog);
  const now = touch();
  return db.backlog.add({
    guid: newGuid(),
    title: title.trim(),
    note: note?.trim() || undefined,
    links: [],
    subtasks: [],
    order: max + 1,
    createdAt: now,
    updatedAt: now,
    due: null,
    dueHasTime: false,
    promotedProjectId: null,
    deletedAt: null,
  });
}

export async function listBacklog(): Promise<BacklogItem[]> {
  const rows = await db.backlog.orderBy("order").toArray();
  return rows.filter((b) => b.deletedAt == null);
}

export async function updateBacklog(
  id: number,
  changes: {
    title?: string;
    note?: string;
    links?: string[];
    subtasks?: Subtask[];
    due?: number | null;
    dueHasTime?: boolean;
  },
): Promise<void> {
  await db.backlog.update(id, {
    ...changes,
    ...(changes.title !== undefined ? { title: changes.title.trim() } : {}),
    updatedAt: touch(),
  });
}

export async function deleteBacklog(id: number): Promise<void> {
  const now = touch();
  await db.transaction("rw", db.backlog, db.photos, async () => {
    const item = await db.backlog.get(id);
    await db.backlog.update(id, { deletedAt: now, updatedAt: now });
    if (item) await tombstonePhotosForParent(item.guid);
  });
}

/** Promote a parked Histórico idea into a full project. */
export async function promoteBacklogToProject(
  item: BacklogItem,
  kind: ProjectKind = "active",
): Promise<number> {
  let projectId = 0;
  const now = touch();
  await db.transaction("rw", db.projects, db.backlog, async () => {
    projectId = await addProject(item.title, kind);
    await db.backlog.update(item.id!, {
      promotedProjectId: projectId,
      deletedAt: now,
      updatedAt: now,
    });
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
