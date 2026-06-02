import Dexie, { type Table } from "dexie";
import type { BacklogItem, Idea, Project, Task } from "@/lib/types";

export interface Meta {
  key: string;
  value: unknown;
}

export class CadenceDB extends Dexie {
  projects!: Table<Project, number>;
  tasks!: Table<Task, number>;
  ideas!: Table<Idea, number>;
  backlog!: Table<BacklogItem, number>;
  meta!: Table<Meta, string>;

  constructor() {
    super("cadence");
    this.version(1).stores({
      projects: "++id, kind, order, archivedAt",
      tasks: "++id, bucket, status, projectId, dayKey, completedAt",
      ideas: "++id, projectId, status",
      backlog: "++id, order",
      meta: "&key",
    });
  }
}

export const db = new CadenceDB();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
