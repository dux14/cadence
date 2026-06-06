import Dexie, { type Table } from "dexie";
import type { BacklogItem, Idea, Photo, Project, Task } from "@/lib/types";
import {
  migrateBacklogV1,
  migrateIdeaV1,
  migrateProjectV1,
  migrateTaskV1,
} from "@/lib/db/migrations";

export interface Meta {
  key: string;
  value: unknown;
}

export class CadenceDB extends Dexie {
  projects!: Table<Project, number>;
  tasks!: Table<Task, number>;
  ideas!: Table<Idea, number>;
  backlog!: Table<BacklogItem, number>;
  photos!: Table<Photo, number>;
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

    this.version(2)
      .stores({
        projects: "++id, &guid, kind, order, archivedAt, updatedAt, deletedAt",
        tasks:
          "++id, &guid, bucket, status, projectId, dayKey, completedAt, due, updatedAt, deletedAt",
        ideas: "++id, &guid, projectId, status, updatedAt, deletedAt",
        backlog: "++id, &guid, order, updatedAt, deletedAt",
        meta: "&key",
      })
      .upgrade(async (tx) => {
        await tx
          .table("projects")
          .toCollection()
          .modify((p) => {
            Object.assign(p, migrateProjectV1({ ...p }));
          });
        await tx
          .table("tasks")
          .toCollection()
          .modify((t) => {
            const next = migrateTaskV1({ ...t });
            // `time` is the only v1 field removed in v2; delete it explicitly instead of
            // nuking every key, so the primary key never round-trips through delete.
            delete (t as Record<string, unknown>).time;
            Object.assign(t, next);
          });
        await tx
          .table("ideas")
          .toCollection()
          .modify((i) => {
            Object.assign(i, migrateIdeaV1({ ...i }));
          });
        await tx
          .table("backlog")
          .toCollection()
          .modify((b) => {
            Object.assign(b, migrateBacklogV1({ ...b }));
          });
      });

    this.version(3).stores({
      photos: "++id, &guid, parentGuid, updatedAt",
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
