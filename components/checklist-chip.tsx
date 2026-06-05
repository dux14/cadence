import { ListChecks } from "lucide-react";
import type { Subtask } from "@/lib/types";

export function ChecklistChip({ subtasks }: { subtasks: Subtask[] }) {
  if (!subtasks || subtasks.length === 0) return null;
  const done = subtasks.filter((s) => s.done).length;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-border/60 px-1.5 py-0.5 text-[11px] font-medium text-muted">
      <ListChecks size={10} /> {done}/{subtasks.length}
    </span>
  );
}
