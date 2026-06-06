"use client";

import { useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db/schema";
import type { Project, Subtask, Task, TaskStatus } from "@/lib/types";
import { BUCKETS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { firstLines } from "@/lib/multiline";
import { ProjectTag } from "./project-tag";
import { LinkChip } from "./link-chip";
import { DueChip } from "./due-chip";
import { ChecklistChip } from "./checklist-chip";
import { PhotoChip } from "./photo-chip";
import { PhotoGrid } from "./photo-grid";
import { PhotoAttachButton } from "./photo-attach-button";
import { StatusToggle } from "./status-toggle";
import { ChecklistEditor } from "./checklist-editor";
import { DuePicker } from "./due-picker";
import { Sheet, SheetContent } from "./ui/sheet";
import { Button } from "./ui/button";
import {
  cycleTaskStatus,
  deleteTask,
  moveTask,
  setTaskStatus,
  updateTask,
} from "@/lib/db/queries";
import { addPhoto, listPhotos } from "@/lib/db/photos";
import { usePasteImages } from "@/lib/use-paste-images";
import type { CompressedImage } from "@/lib/image/compress";
import { extractLinks } from "@/lib/links";

const STATUSES: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];

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
  const [projectId, setProjectId] = useState<number | null>(task.projectId ?? null);
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks ?? []);
  const [due, setDue] = useState<number | null>(task.due ?? null);
  const [dueHasTime, setDueHasTime] = useState<boolean>(task.dueHasTime ?? false);
  const done = task.status === "done";
  const [isNew] = useState(() => Date.now() - task.createdAt < 1500);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const projects = useLiveQuery(
    () => (open ? db.projects.orderBy("order").toArray() : []),
    [open],
  );

  const photos = useLiveQuery(() => listPhotos(task.guid), [task.guid], []);

  async function attachPhoto(img: CompressedImage) {
    try {
      await addPhoto({ parentType: "task", parentGuid: task.guid, ...img });
      setPhotoError(null);
    } catch {
      setPhotoError("Couldn't add that image.");
    }
  }

  usePasteImages(open, attachPhoto, setPhotoError);

  function openSheet() {
    setTitle(task.title);
    setProjectId(task.projectId ?? null);
    setSubtasks(task.subtasks ?? []);
    setDue(task.due ?? null);
    setDueHasTime(task.dueHasTime ?? false);
    setOpen(true);
  }

  function save() {
    const { title: cleanTitle, links } = extractLinks(title);
    const t = cleanTitle.trim() || title.trim();
    if (!t) return;
    void updateTask(task.id!, {
      title: t,
      projectId,
      links: links.length ? [...new Set([...task.links, ...links])] : task.links,
      subtasks,
      due,
      dueHasTime,
    });
    setOpen(false);
  }

  const hasPreview =
    task.due != null ||
    (task.subtasks?.length ?? 0) > 0 ||
    task.links.length > 0 ||
    photos.length > 0 ||
    !!project ||
    (task.carried && !done);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5",
        isNew && "row-arrive",
      )}
    >
      <StatusToggle status={task.status} onCycle={() => void cycleTaskStatus(task)} />

      <button onClick={openSheet} className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            "block whitespace-pre-line text-[15px] leading-snug line-clamp-2",
            done ? "text-muted line-through" : "text-foreground",
          )}
        >
          {firstLines(task.title, 2)}
        </span>
        {hasPreview && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {/* Fixed order: [due][checklist][links][photos(SP2)] */}
            <DueChip due={task.due} dueHasTime={task.dueHasTime} />
            <ChecklistChip subtasks={task.subtasks ?? []} />
            {task.links.map((l) => (
              <LinkChip key={l} url={l} />
            ))}
            <PhotoChip count={photos.length} />
            {project && <ProjectTag name={project.name} color={project.color} />}
            {task.carried && !done && (
              <span className="inline-flex items-center gap-1 rounded-md bg-border/60 px-1.5 py-0.5 text-[11px] text-muted">
                carried
              </span>
            )}
          </span>
        )}
      </button>

      {handle}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Edit task">
          <p className="mb-1.5 text-[12px] font-medium text-muted">Status</p>
          <div className="mb-4 grid grid-cols-4 gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                onClick={() => void setTaskStatus(task.id!, s.id)}
                className={cn(
                  "rounded-full px-2 py-1.5 text-[11px] font-medium transition",
                  task.status === s.id
                    ? "bg-primary text-primary-ink"
                    : "border border-border text-muted",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-[15px] outline-none focus:border-primary"
          />

          <div className="mt-4">
            <DuePicker
              due={due}
              dueHasTime={dueHasTime}
              onChange={(n) => {
                setDue(n.due);
                setDueHasTime(n.dueHasTime);
              }}
            />
          </div>

          <div className="mt-4">
            <ChecklistEditor subtasks={subtasks} onChange={setSubtasks} />
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-[12px] font-medium text-muted">Photos</p>
            <PhotoAttachButton onAttach={attachPhoto} onError={setPhotoError} />
            {photoError && (
              <p className="mt-1.5 text-[12px] text-danger">{photoError}</p>
            )}
            <PhotoGrid photos={photos} />
          </div>

          {task.links.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[12px] font-medium text-muted">Links</p>
              <div className="flex flex-wrap gap-1.5">
                {task.links.map((l) => (
                  <LinkChip key={l} url={l} />
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 mb-1.5 text-[12px] font-medium text-muted">Project</p>
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

          <p className="mt-4 mb-1.5 text-[12px] font-medium text-muted">Move to</p>
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
