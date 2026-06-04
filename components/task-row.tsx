"use client";

import { useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Clock, RotateCcw, Trash2 } from "lucide-react";
import { db } from "@/lib/db/schema";
import type { Project, Task } from "@/lib/types";
import { BUCKETS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/date";
import { ProjectTag } from "./project-tag";
import { LinkChip } from "./link-chip";
import { Sheet, SheetContent } from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { deleteTask, moveTask, toggleTask, updateTask } from "@/lib/db/queries";

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
  const [projectId, setProjectId] = useState<number | null>(
    task.projectId ?? null,
  );
  const [time, setTime] = useState(task.time ?? "");
  const done = task.status === "done";
  // Creation feedback: rows mounting right after their createdAt pulse mint.
  // Lazy state: evaluated once per mount, keeping render pure.
  const [isNew] = useState(() => Date.now() - task.createdAt < 1500);

  // Only query the project list while the sheet is open; rows stay cheap.
  const projects = useLiveQuery(
    () => (open ? db.projects.orderBy("order").toArray() : []),
    [open],
  );

  function openSheet() {
    setTitle(task.title);
    setProjectId(task.projectId ?? null);
    setTime(task.time ?? "");
    setOpen(true);
  }

  function save() {
    const t = title.trim();
    if (!t) return;
    void updateTask(task.id!, { title: t, projectId, time: time || null });
    setOpen(false);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5",
        isNew && "row-arrive",
      )}
    >
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

      <button onClick={openSheet} className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            "block truncate text-[15px]",
            done ? "text-muted line-through" : "text-foreground",
          )}
        >
          {task.title}
        </span>
        {(project ||
          task.time ||
          task.links.length > 0 ||
          (task.carried && !done)) && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {task.time && (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                <Clock size={10} /> {formatTime(task.time)}
              </span>
            )}
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
        <SheetContent title="Edit task">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          <p className="mt-4 mb-1.5 text-[12px] font-medium text-muted">
            Project
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setProjectId(null)}
              className={cn(
                "rounded-full px-2.5 py-1.5 text-[12px] font-medium transition",
                projectId === null
                  ? "bg-primary text-primary-ink"
                  : "border border-border text-muted",
              )}
            >
              None
            </button>
            {projects?.map((p) => (
              <button
                key={p.id}
                onClick={() => setProjectId(p.id!)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition",
                  projectId === p.id
                    ? "bg-primary text-primary-ink"
                    : "border border-border text-muted",
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: p.color }}
                />
                {p.name}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] text-muted">
              <Clock size={12} />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-label="Time of day"
                className="bg-transparent text-foreground outline-none"
              />
            </label>
            {time && (
              <button
                onClick={() => setTime("")}
                className="text-[12px] text-muted transition hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
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
            <Button size="sm" onClick={save} disabled={!title.trim()}>
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
