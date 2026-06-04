"use client";

import { GripVertical } from "lucide-react";
import type { Idea } from "@/lib/types";
import { reorderIdeas } from "@/lib/db/queries";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { IdeaRow } from "./idea-row";
import { cn } from "@/lib/utils";

export function IdeaList({ ideas }: { ideas: Idea[] }) {
  const { order, draggingId, rowRef, handleProps } = useDragReorder(
    ideas,
    (ids) => void reorderIdeas(ids),
  );

  return (
    <ul className="flex flex-col gap-2">
      {order.map((i) => (
        <li
          key={i.id}
          ref={rowRef(i.id!)}
          className={cn(
            "transition-transform",
            draggingId === i.id && "scale-[1.02] opacity-95",
          )}
        >
          <IdeaRow
            idea={i}
            handle={
              <button
                aria-label="Drag to reorder"
                className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing"
                {...handleProps(i.id!)}
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
