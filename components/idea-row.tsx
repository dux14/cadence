"use client";

import { useState, type ReactNode } from "react";
import { ArrowUpRight, Trash2 } from "lucide-react";
import type { Idea, Subtask } from "@/lib/types";
import { BUCKETS } from "@/lib/types";
import {
  deleteIdea,
  promoteIdeaToTask,
  updateIdea,
} from "@/lib/db/queries";
import { extractLinks } from "@/lib/links";
import { firstLines } from "@/lib/multiline";
import { Sheet, SheetContent } from "./ui/sheet";
import { Button } from "./ui/button";
import { LinkChip } from "./link-chip";
import { DueChip } from "./due-chip";
import { ChecklistChip } from "./checklist-chip";
import { ChecklistEditor } from "./checklist-editor";
import { DuePicker } from "./due-picker";
import { cn } from "@/lib/utils";

export function IdeaRow({ idea, handle }: { idea: Idea; handle?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(idea.text);
  const [subtasks, setSubtasks] = useState<Subtask[]>(idea.subtasks ?? []);
  const [due, setDue] = useState<number | null>(idea.due ?? null);
  const [dueHasTime, setDueHasTime] = useState<boolean>(idea.dueHasTime ?? false);
  const [isNew] = useState(() => Date.now() - idea.createdAt < 1500);

  function openSheet() {
    setText(idea.text);
    setSubtasks(idea.subtasks ?? []);
    setDue(idea.due ?? null);
    setDueHasTime(idea.dueHasTime ?? false);
    setOpen(true);
  }

  // Shared extraction so save() and promote write identical, stripped values.
  function buildPayload() {
    const { title: cleanText, links: extracted } = extractLinks(text);
    const finalText = cleanText.trim() || text.trim();
    const mergedLinks = extracted.length
      ? [...new Set([...(idea.links ?? []), ...extracted])]
      : idea.links ?? [];
    return { text: finalText, links: mergedLinks, subtasks, due, dueHasTime };
  }

  function save() {
    const payload = buildPayload();
    if (!payload.text) return;
    void updateIdea(idea.id!, payload);
    setOpen(false);
  }

  const hasPreview =
    idea.due != null ||
    (idea.subtasks?.length ?? 0) > 0 ||
    (idea.links?.length ?? 0) > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5",
        isNew && "row-arrive",
      )}
    >
      <button onClick={openSheet} className="min-w-0 flex-1 text-left">
        <p className="whitespace-pre-line text-[14px] leading-snug text-foreground line-clamp-2">
          {firstLines(idea.text, 2)}
        </p>
        {hasPreview && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <DueChip due={idea.due} dueHasTime={idea.dueHasTime} />
            <ChecklistChip subtasks={idea.subtasks ?? []} />
            {(idea.links ?? []).map((l) => (
              <LinkChip key={l} url={l} />
            ))}
          </span>
        )}
      </button>
      <button
        onClick={openSheet}
        aria-label="Promote to task"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-border/50 hover:text-foreground"
      >
        <ArrowUpRight size={16} />
      </button>
      <button
        onClick={() => deleteIdea(idea.id!)}
        aria-label="Delete idea"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:text-danger"
      >
        <Trash2 size={15} />
      </button>

      {handle}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Edit idea">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-[14px] outline-none focus:border-primary"
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

          {(idea.links?.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[12px] font-medium text-muted">Links</p>
              <div className="flex flex-wrap gap-1.5">
                {(idea.links ?? []).map((l) => (
                  <LinkChip key={l} url={l} />
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 mb-1.5 text-[12px] font-medium text-muted">
            Promote to
          </p>
          <div className="grid grid-cols-3 gap-2">
            {BUCKETS.map((b) => (
              <Button
                key={b.id}
                variant="soft"
                size="sm"
                onClick={() => {
                  const payload = buildPayload();
                  if (!payload.text) return;
                  // Persist edits first so promote transfers them.
                  void updateIdea(idea.id!, payload);
                  void promoteIdeaToTask({ ...idea, ...payload }, b.id);
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
                deleteIdea(idea.id!);
                setOpen(false);
              }}
            >
              <Trash2 size={15} /> Delete
            </Button>
            <Button size="sm" onClick={save} disabled={!text.trim()}>
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
