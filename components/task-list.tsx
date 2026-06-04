"use client";

import { GripVertical } from "lucide-react";
import type { Project, Task } from "@/lib/types";
import { reorderTasks } from "@/lib/db/queries";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { TaskRow } from "./task-row";
import { cn } from "@/lib/utils";

export function TaskList({
  tasks,
  projects,
}: {
  tasks: Task[];
  projects: Map<number, Project>;
}) {
  const { order, draggingId, rowRef, handleProps } = useDragReorder(
    tasks,
    (ids) => void reorderTasks(ids),
  );

  return (
    <ul className="flex flex-col gap-2">
      {order.map((t) => (
        <li
          key={t.id}
          ref={rowRef(t.id!)}
          className={cn(
            "transition-transform",
            draggingId === t.id && "scale-[1.02] opacity-95",
          )}
        >
          <TaskRow
            task={t}
            project={t.projectId ? projects.get(t.projectId) : undefined}
            handle={
              // Timed tasks sort by their time; only untimed rows drag.
              t.time ? undefined : (
                <button
                  aria-label="Drag to reorder"
                  className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing"
                  {...handleProps(t.id!)}
                >
                  <GripVertical size={16} />
                </button>
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}
