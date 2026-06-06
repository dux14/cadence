"use client";

import { useEffect, useRef } from "react";
import { GripVertical } from "lucide-react";
import type { Bucket, Project, Task } from "@/lib/types";
import { BUCKETS } from "@/lib/types";
import { reorderTasks } from "@/lib/db/queries";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { adjacentBucket, moveByOffset } from "@/lib/drag-board";
import { TaskRow } from "./task-row";
import { cn } from "@/lib/utils";

export function TaskList({
  tasks,
  projects,
  bucket,
  onTransfer,
  onAnnounce,
  onRequestFocus,
}: {
  tasks: Task[];
  projects: Map<number, Project>;
  /** Cuando se pasa, habilita drag horizontal entre columnas (board desktop). */
  bucket?: Bucket;
  onTransfer?: (id: number, toBucket: Bucket) => void;
  onAnnounce?: (msg: string) => void;
  onRequestFocus?: (id: number) => void;
}) {
  const { order, draggingId, rowRef, handleProps } = useDragReorder(
    tasks,
    (ids) => void reorderTasks(ids),
    bucket && onTransfer ? { bucket, onTransfer } : undefined,
  );

  // Fix 2: optimistic order ref so fast consecutive keystrokes don't clobber
  // each other while the Dexie round-trip is in flight.
  const keyOrderRef = useRef<number[] | null>(null);
  useEffect(() => {
    // When useLiveQuery delivers a fresh resync, invalidate the optimistic ref
    // so the next keystroke starts from the authoritative order.
    keyOrderRef.current = null;
  }, [order]);

  const bucketIds = BUCKETS.map((b) => b.id);

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
                  data-task-id={t.id}
                  aria-label={
                    onTransfer && bucket
                      ? "Drag to reorder or move bucket. Arrow keys: up/down reorder, left/right move between columns"
                      : "Drag to reorder"
                  }
                  aria-keyshortcuts={
                    onTransfer && bucket
                      ? "ArrowUp ArrowDown ArrowLeft ArrowRight"
                      : undefined
                  }
                  className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing"
                  onKeyDown={
                    bucket && onTransfer
                      ? (e) => {
                          if (
                            e.key !== "ArrowUp" &&
                            e.key !== "ArrowDown" &&
                            e.key !== "ArrowLeft" &&
                            e.key !== "ArrowRight"
                          ) {
                            return;
                          }
                          e.preventDefault();

                          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            const dir = e.key === "ArrowDown" ? 1 : -1;
                            // Fix 2: use optimistic ref if available so fast
                            // keystrokes don't clobber each other.
                            const base =
                              keyOrderRef.current ?? order.map((x) => x.id!);
                            const next = moveByOffset(base, t.id!, dir);
                            if (next === null) return;
                            // Fix 4: clamp at done/not-done boundary.
                            // Find the id at the destination position and check
                            // if it crosses the done boundary.
                            const fromIdx = base.indexOf(t.id!);
                            const toIdx = fromIdx + dir;
                            // toIdx is valid (moveByOffset returned non-null)
                            const neighborId = base[toIdx];
                            const neighborTask = tasks.find(
                              (x) => x.id === neighborId,
                            );
                            if (!neighborTask) return; // defensive: id not in tasks
                            const movingDone = t.status === "done";
                            const neighborDone = neighborTask.status === "done";
                            if (movingDone !== neighborDone) return; // boundary — no-op
                            keyOrderRef.current = next;
                            void reorderTasks(next);
                            onAnnounce?.(
                              `Moved to position ${next.indexOf(t.id!) + 1} of ${next.length}`,
                            );
                          } else {
                            // ArrowLeft / ArrowRight
                            const dir = e.key === "ArrowRight" ? 1 : -1;
                            const target = adjacentBucket(bucket, dir, bucketIds);
                            if (target === null) return;
                            onTransfer(t.id!, target);
                            onRequestFocus?.(t.id!);
                            const targetLabel =
                              BUCKETS.find((b) => b.id === target)?.label ?? target;
                            onAnnounce?.(`Moved to ${targetLabel}`);
                          }
                        }
                      : undefined
                  }
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
