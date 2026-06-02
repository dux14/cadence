"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import type { Project, Task } from "@/lib/types";
import { reorderTasks } from "@/lib/db/queries";
import { TaskRow } from "./task-row";
import { cn } from "@/lib/utils";

/**
 * Drag-to-reorder list. Pointer-event based (works on touch + mouse) with no
 * external dependency. Items swap as the pointer crosses a row's midpoint;
 * the new order is persisted on release.
 */
export function TaskList({
  tasks,
  projects,
}: {
  tasks: Task[];
  projects: Map<number, Project>;
}) {
  const [order, setOrder] = useState<Task[]>(tasks);
  const dragId = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Resync when the underlying data changes (toggles, adds, edits).
  useEffect(() => {
    if (dragId.current === null) setOrder(tasks);
  }, [tasks]);

  function onMove(e: React.PointerEvent) {
    if (dragId.current === null) return;
    const y = e.clientY;
    for (const [id, el] of rowRefs.current) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        if (id !== dragId.current) {
          setOrder((prev) => {
            const from = prev.findIndex((t) => t.id === dragId.current);
            const to = prev.findIndex((t) => t.id === id);
            if (from < 0 || to < 0 || from === to) return prev;
            const next = prev.slice();
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
          });
        }
        break;
      }
    }
  }

  function onUp() {
    if (dragId.current !== null) {
      void reorderTasks(order.map((t) => t.id!));
    }
    dragId.current = null;
    setDraggingId(null);
  }

  return (
    <ul className="flex flex-col gap-2">
      {order.map((t) => (
        <li
          key={t.id}
          ref={(el) => {
            if (el) rowRefs.current.set(t.id!, el);
            else rowRefs.current.delete(t.id!);
          }}
          className={cn(
            "transition-transform",
            draggingId === t.id && "scale-[1.02] opacity-95",
          )}
        >
          <TaskRow
            task={t}
            project={t.projectId ? projects.get(t.projectId) : undefined}
            handle={
              <button
                aria-label="Drag to reorder"
                className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing"
                onPointerDown={(e) => {
                  dragId.current = t.id!;
                  setDraggingId(t.id!);
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                <GripVertical size={16} />
              </button>
            }
          />
        </li>
      ))}
    </ul>
  );
}
