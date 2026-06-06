"use client";

import { GripVertical } from "lucide-react";
import type { Bucket, Project, Task } from "@/lib/types";
import { reorderTasks } from "@/lib/db/queries";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { TaskRow } from "./task-row";
import { cn } from "@/lib/utils";

export function TaskList({
  tasks,
  projects,
  bucket,
  onTransfer,
}: {
  tasks: Task[];
  projects: Map<number, Project>;
  /** Cuando se pasa, habilita drag horizontal entre columnas (board desktop). */
  bucket?: Bucket;
  onTransfer?: (id: number, toBucket: Bucket) => void;
}) {
  const { order, draggingId, rowRef, handleProps } = useDragReorder(
    tasks,
    (ids) => void reorderTasks(ids),
    bucket && onTransfer ? { bucket, onTransfer } : undefined,
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
              // Board mode (onTransfer present): all rows drag so they can be
              // transferred between columns; the due time is preserved on transfer.
              // Mobile mode (no onTransfer): timed-due tasks don't drag (original behaviour).
              onTransfer || !t.dueHasTime ? (
                <button
                  data-drag-handle
                  aria-label={
                    onTransfer
                      ? "Drag to reorder or move bucket"
                      : "Drag to reorder"
                  }
                  className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing"
                  {...handleProps(t.id!)}
                >
                  <GripVertical size={16} />
                </button>
              ) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}
