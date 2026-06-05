import { newGuid } from "@/lib/id";
import type { BacklogItem, Idea, Project, Task } from "@/lib/types";

/** Shape of v1 rows as they exist on disk before the v2 upgrade. */
interface TaskV1 {
  id?: number;
  title: string;
  links: string[];
  projectId?: number | null;
  bucket: "today" | "tomorrow" | "week";
  status: "open" | "done";
  order: number;
  createdAt: number;
  completedAt?: number | null;
  time?: string | null;
  carried?: boolean;
  dayKey?: string | null;
  archived?: boolean;
  archivedAt?: number | null;
}

interface IdeaV1 {
  id?: number;
  projectId: number;
  text: string;
  status: "open" | "promoted";
  order: number;
  createdAt: number;
}

interface BacklogV1 {
  id?: number;
  title: string;
  note?: string;
  order: number;
  createdAt: number;
  promotedProjectId?: number | null;
}

interface ProjectV1 {
  id?: number;
  name: string;
  kind: "active" | "area";
  color: string;
  order: number;
  createdAt: number;
  archivedAt?: number | null;
}

/** Local "HH:mm" + dayKey -> epoch ms in local time. Null on malformed time. */
function timeToDue(time: string, dayKey: string | null | undefined): number | null {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  let y: number, mo: number, d: number;
  if (dayKey) {
    const [yy, mm, dd] = dayKey.split("-").map(Number);
    y = yy;
    mo = mm - 1;
    d = dd;
  } else {
    const now = new Date();
    y = now.getFullYear();
    mo = now.getMonth();
    d = now.getDate();
  }
  const due = new Date(y, mo, d, h, m, 0, 0).getTime();
  return isNaN(due) ? null : due;
}

export function migrateTaskV1(t: TaskV1): Task {
  const hasTime = typeof t.time === "string" && t.time.length > 0;
  const due = hasTime ? timeToDue(t.time as string, t.dayKey) : null;
  return {
    id: t.id,
    guid: newGuid(),
    title: t.title,
    links: t.links ?? [],
    subtasks: [],
    projectId: t.projectId ?? null,
    bucket: t.bucket,
    status: t.status === "done" ? "done" : "todo",
    order: t.order,
    createdAt: t.createdAt,
    updatedAt: t.createdAt,
    completedAt: t.completedAt ?? null,
    due,
    dueHasTime: due != null,
    carried: t.carried ?? false,
    dayKey: t.dayKey ?? null,
    archived: t.archived ?? false,
    archivedAt: t.archivedAt ?? null,
    deletedAt: null,
  };
}

export function migrateIdeaV1(i: IdeaV1): Idea {
  return {
    id: i.id,
    guid: newGuid(),
    projectId: i.projectId,
    text: i.text,
    links: [],
    subtasks: [],
    status: i.status,
    order: i.order,
    createdAt: i.createdAt,
    updatedAt: i.createdAt,
    due: null,
    dueHasTime: false,
    deletedAt: null,
  };
}

export function migrateBacklogV1(b: BacklogV1): BacklogItem {
  return {
    id: b.id,
    guid: newGuid(),
    title: b.title,
    note: b.note,
    links: [],
    subtasks: [],
    order: b.order,
    createdAt: b.createdAt,
    updatedAt: b.createdAt,
    due: null,
    dueHasTime: false,
    promotedProjectId: b.promotedProjectId ?? null,
    deletedAt: null,
  };
}

export function migrateProjectV1(p: ProjectV1): Project {
  return {
    id: p.id,
    guid: newGuid(),
    name: p.name,
    kind: p.kind,
    color: p.color,
    order: p.order,
    createdAt: p.createdAt,
    updatedAt: p.createdAt,
    archivedAt: p.archivedAt ?? null,
    deletedAt: null,
  };
}
