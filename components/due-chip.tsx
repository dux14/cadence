import { Clock } from "lucide-react";
import { formatDue, isOverdue } from "@/lib/due";
import { cn } from "@/lib/utils";

export function DueChip({
  due,
  dueHasTime,
}: {
  due?: number | null;
  dueHasTime?: boolean;
}) {
  if (due == null) return null;
  const overdue = isOverdue(due);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        overdue ? "bg-danger/15 text-danger" : "bg-primary/15 text-foreground",
      )}
    >
      <Clock size={10} /> {formatDue(due, dueHasTime ?? false)}
    </span>
  );
}
