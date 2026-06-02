"use client";

import { useState, type ReactNode } from "react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import type { Project, Task } from "@/lib/types";
import { BUCKETS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProjectTag } from "./project-tag";
import { LinkChip } from "./link-chip";
import { Sheet, SheetClose, SheetContent } from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  deleteTask,
  moveTask,
  toggleTask,
  updateTaskTitle,
} from "@/lib/db/queries";

export function TaskRow({
  task,
  project,
  handle,
}: {
  task: Task;
  project?: Project;
  handle?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const done = task.status === "done";

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5">
      <button
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={() => toggleTask(task)}
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition",
          done
            ? "border-accent bg-accent text-accent-ink"
            : "border-primary text-transparent",
        )}
      >
        <Check size={12} strokeWidth={3} />
      </button>

      <button onClick={() => setOpen(true)} className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            "block truncate text-[15px]",
            done ? "text-muted line-through" : "text-foreground",
          )}
        >
          {task.title}
        </span>
        {(project || task.links.length > 0 || (task.carried && !done)) && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {project && <ProjectTag name={project.name} color={project.color} />}
            {task.links.map((l) => (
              <LinkChip key={l} url={l} />
            ))}
            {task.carried && !done && (
              <span className="inline-flex items-center gap-1 rounded-md bg-border/60 px-1.5 py-0.5 text-[11px] text-muted">
                <RotateCcw size={10} /> carried
              </span>
            )}
          </span>
        )}
      </button>

      {handle}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Task actions">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const t = title.trim();
              if (t && t !== task.title) updateTaskTitle(task.id!, t);
            }}
          />
          <p className="mt-4 mb-1.5 text-[12px] font-medium text-muted">
            Move to
          </p>
          <div className="grid grid-cols-3 gap-2">
            {BUCKETS.map((b) => (
              <Button
                key={b.id}
                variant={task.bucket === b.id ? "primary" : "soft"}
                size="sm"
                onClick={() => {
                  moveTask(task.id!, b.id);
                  setOpen(false);
                }}
              >
                {b.label}
              </Button>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                deleteTask(task.id!);
                setOpen(false);
              }}
            >
              <Trash2 size={15} /> Delete
            </Button>
            <SheetClose asChild>
              <Button variant="soft" size="sm">
                Done
              </Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
