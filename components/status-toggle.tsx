"use client";

import { Ban, CheckCircle2, Circle, CircleDot } from "lucide-react";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON = {
  todo: Circle,
  in_progress: CircleDot,
  done: CheckCircle2,
  blocked: Ban,
} as const;

const LABEL: Record<TaskStatus, string> = {
  todo: "To do — tap to start",
  in_progress: "In progress — tap to complete",
  done: "Done — tap to reset",
  blocked: "Blocked — tap to reset",
};

export function StatusToggle({
  status,
  onCycle,
  className,
}: {
  status: TaskStatus;
  onCycle: () => void;
  className?: string;
}) {
  const Icon = ICON[status];
  return (
    <button
      type="button"
      aria-label={LABEL[status]}
      onClick={onCycle}
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-full transition",
        status === "done" && "text-accent",
        status === "in_progress" && "text-primary",
        status === "blocked" && "text-amber-500",
        status === "todo" && "text-primary",
        className,
      )}
    >
      <Icon size={20} strokeWidth={status === "done" ? 2.5 : 2} />
    </button>
  );
}
