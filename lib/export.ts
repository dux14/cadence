import { db } from "@/lib/db/schema";
import type { BacklogItem, Idea, Project, Task } from "@/lib/types";

export interface Snapshot {
  version: 2;
  exportedAt: number;
  projects: Project[];
  tasks: Task[];
  ideas: Idea[];
  backlog: BacklogItem[];
  meta: { key: string; value: unknown }[];
}

/** Full, unfiltered backup of every table (tombstones included). */
export async function exportSnapshot(): Promise<Snapshot> {
  const [projects, tasks, ideas, backlog, meta] = await Promise.all([
    db.projects.toArray(),
    db.tasks.toArray(),
    db.ideas.toArray(),
    db.backlog.toArray(),
    db.meta.toArray(),
  ]);
  return {
    version: 2,
    exportedAt: Date.now(),
    projects,
    tasks,
    ideas,
    backlog,
    meta,
  };
}

/** Trigger a browser download of the snapshot as a JSON file. */
export async function downloadSnapshot(): Promise<void> {
  const snap = await exportSnapshot();
  const blob = new Blob([JSON.stringify(snap, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cadence-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
