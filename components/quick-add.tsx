"use client";

import { useState } from "react";
import { Image as ImageIcon, Maximize2, Minimize2, Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { addTask } from "@/lib/db/queries";
import { addPhoto } from "@/lib/db/photos";
import { extractLinks } from "@/lib/links";
import { usePasteImages } from "@/lib/use-paste-images";
import type { CompressedImage } from "@/lib/image/compress";
import { BUCKETS, type Bucket } from "@/lib/types";
import { Sheet, SheetContent } from "./ui/sheet";
import { Button } from "./ui/button";
import { DuePicker } from "./due-picker";
import { PhotoAttachButton } from "./photo-attach-button";
import { cn } from "@/lib/utils";

export function QuickAdd({
  defaultBucket = "today",
  defaultProjectId = null,
}: {
  defaultBucket?: Bucket;
  defaultProjectId?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [bucket, setBucket] = useState<Bucket>(defaultBucket);
  const [projectId, setProjectId] = useState<number | null>(defaultProjectId);
  const [due, setDue] = useState<number | null>(null);
  const [dueHasTime, setDueHasTime] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<CompressedImage[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const projects = useLiveQuery(
    () => db.projects.orderBy("order").toArray(),
    [],
    [],
  );

  // Capture pastes only while the add sheet is open, so screenshots land here
  // without hijacking pastes elsewhere in the app.
  usePasteImages(
    open,
    (img) => setPending((p) => [...p, img]),
    setPhotoError,
  );

  function openSheet() {
    setBucket(defaultBucket);
    setProjectId(defaultProjectId);
    setText("");
    setDue(null);
    setDueHasTime(false);
    setExpanded(false);
    setPending([]);
    setPhotoError(null);
    setOpen(true);
  }

  async function submit() {
    const { title, links } = extractLinks(text);
    const finalTitle = title.trim() || text.trim();
    // Allow creating with photos only (no title typed).
    if (!finalTitle && pending.length === 0) return;
    const titleToSave = finalTitle || "Photo";
    try {
      await db.transaction("rw", db.tasks, db.photos, async () => {
        const taskId = await addTask({
          title: titleToSave,
          links,
          projectId,
          bucket,
          due,
          dueHasTime,
        });
        if (pending.length > 0) {
          const task = await db.tasks.get(taskId);
          if (task) {
            for (const img of pending) {
              await addPhoto({ parentType: "task", parentGuid: task.guid, ...img });
            }
          }
        }
      });
    } catch {
      setPhotoError("No se pudo guardar la tarea. Inténtalo de nuevo.");
      return;
    }
    setPending([]);
    setPhotoError(null);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={openSheet}
        aria-label="Add task"
        className="fixed bottom-24 right-[max(1rem,calc(50%-13rem))] z-30 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-ink shadow-lg shadow-primary/40 transition active:scale-95 md:bottom-8 md:right-[max(2rem,calc(50%-22.5rem))] xl:right-[calc(50%-30.5rem)]"
      >
        <Plus size={26} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Add a task">
          <div className="relative">
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What needs doing? Paste links too…"
              rows={expanded ? 6 : 2}
              onKeyDown={(e) => {
                // Expanded = multiline mode: Enter inserts a newline (mobile has
                // no Shift); submit via the button below.
                // Collapsed: Enter submits, Shift+Enter inserts a newline.
                if (expanded) return;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 pr-9 text-[15px] outline-none focus:border-primary"
            />
            <button
              type="button"
              aria-label={expanded ? "Salir de modo multilínea" : "Modo multilínea"}
              title={expanded ? "Salir de modo multilínea" : "Modo multilínea"}
              onClick={() => setExpanded((v) => !v)}
              className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-muted transition hover:text-foreground"
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>

          <div className="mt-3 flex gap-1.5">
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                onClick={() => setBucket(b.id)}
                className={cn(
                  "flex-1 rounded-full px-2 py-1.5 text-[12px] font-medium transition",
                  bucket === b.id
                    ? "bg-primary text-primary-ink"
                    : "border border-border text-muted",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setProjectId(null)}
              className={cn(
                "rounded-full border border-border px-2.5 py-1 text-[12px] transition",
                projectId === null ? "text-foreground" : "text-muted",
              )}
            >
              No project
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setProjectId(p.id!)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] transition",
                  projectId === p.id ? "text-foreground" : "text-muted",
                )}
                style={
                  projectId === p.id
                    ? { borderColor: p.color, background: `${p.color}22` }
                    : undefined
                }
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: p.color }}
                />
                {p.name}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <DuePicker
              due={due}
              dueHasTime={dueHasTime}
              onChange={(n) => {
                setDue(n.due);
                setDueHasTime(n.dueHasTime);
              }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PhotoAttachButton
              onAttach={(img) => setPending((p) => [...p, img])}
              onError={setPhotoError}
            />
            {pending.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-border/60 px-1.5 py-0.5 text-[11px] text-muted">
                <ImageIcon size={11} /> {pending.length} attached
              </span>
            )}
          </div>
          {photoError && (
            <p className="mt-1.5 text-[12px] text-danger">{photoError}</p>
          )}

          <Button
            className="mt-5 w-full"
            onClick={() => void submit()}
            disabled={!text.trim() && pending.length === 0}
          >
            Add task
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
