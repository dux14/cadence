import { db, getMeta, setMeta } from "@/lib/db/schema";
import type { Table } from "@/lib/sync/types";

const PUSH_KEY = (t: Table) => `sync.lastPushedAt.${t}`;
const PULL_KEY = (t: Table) => `sync.pullCursor.${t}`;

export async function getLastPushedAt(t: Table): Promise<number> {
  return getMeta<number>(PUSH_KEY(t), 0);
}
export async function setLastPushedAt(t: Table, value: number): Promise<void> {
  await setMeta(PUSH_KEY(t), value);
}
export async function getPullCursor(t: Table): Promise<number> {
  return getMeta<number>(PULL_KEY(t), 0);
}
export async function setPullCursor(t: Table, value: number): Promise<void> {
  await setMeta(PULL_KEY(t), value);
}

const TABLE_REF = {
  projects: () => db.projects,
  tasks: () => db.tasks,
  ideas: () => db.ideas,
  backlog: () => db.backlog,
} as const;

/** Local rows changed since the last successful push (updatedAt is monotonic). */
export async function getDirtyRows<T extends { updatedAt: number }>(
  table: Exclude<Table, "photos">,
  since: number,
): Promise<T[]> {
  const all = (await TABLE_REF[table]().toArray()) as unknown as T[];
  return all.filter((r) => r.updatedAt > since);
}

/** Reset all cursors — used to force a full re-push (initial migration). */
export async function resetSyncCursors(): Promise<void> {
  const tables: Table[] = ["projects", "tasks", "ideas", "backlog", "photos"];
  await Promise.all(
    tables.flatMap((t) => [setLastPushedAt(t, 0), setPullCursor(t, 0)]),
  );
}
