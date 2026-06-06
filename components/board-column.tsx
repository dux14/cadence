"use client";

import { db } from "@/lib/db/schema";
import { transferTask } from "@/lib/db/queries";
import { TaskList } from "./task-list";
import { QuickAdd } from "./quick-add";
import { cn } from "@/lib/utils";
import type { Bucket, Project, Task } from "@/lib/types";

export function BoardColumn({
  bucket,
  label,
  tasks,
  projects,
  isDropTarget,
  onDragStateChange,
  onAnnounce,
  onRequestFocus,
}: {
  bucket: Bucket;
  label: string;
  tasks: Task[];
  projects: Map<number, Project>;
  isDropTarget: boolean;
  onDragStateChange: (dropBucket: Bucket | null) => void;
  onAnnounce?: (msg: string) => void;
  onRequestFocus?: (id: number, bucket: Bucket) => void;
}) {
  // Count non-done tasks for the column header badge.
  const openCount = tasks.filter((t) => t.status !== "done").length;

  async function handleTransfer(id: number, toBucket: Bucket) {
    // Build destination order: existing dest tasks (excluding the moved id) + moved id at end.
    const dest = await db.tasks
      .where("bucket")
      .equals(toBucket)
      .filter((t) => !t.archived && t.deletedAt == null)
      .toArray();
    const orderedIds = [
      ...dest.map((t) => t.id!).filter((tid) => tid !== id),
      id,
    ];
    await transferTask(id, toBucket, orderedIds);
    onDragStateChange(null);
  }

  return (
    <section
      data-bucket={bucket}
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-2xl border bg-background/40 p-3 transition-colors",
        isDropTarget
          ? "border-primary ring-2 ring-primary/40 board-drop"
          : "border-border",
      )}
    >
      <header className="mb-3 flex items-baseline justify-between px-1">
        <h2 className="font-display text-[15px] font-bold">{label}</h2>
        <span className="text-[12px] tabular-nums text-muted">{openCount}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <p className="px-1 py-6 text-center text-[13px] text-muted">
            Nothing here yet
          </p>
        ) : (
          <TaskList
            tasks={tasks}
            projects={projects}
            bucket={bucket}
            onTransfer={handleTransfer}
            onAnnounce={onAnnounce}
            onRequestFocus={onRequestFocus}
          />
        )}
      </div>

      <div className="relative mt-2">
        <QuickAdd defaultBucket={bucket} variant="inline" />
      </div>
    </section>
  );
}
