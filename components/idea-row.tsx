"use client";

import { useState, type ReactNode } from "react";
import { ArrowUpRight, Trash2 } from "lucide-react";
import type { Idea } from "@/lib/types";
import { BUCKETS } from "@/lib/types";
import { deleteIdea, promoteIdeaToTask, updateIdeaText } from "@/lib/db/queries";
import { Sheet, SheetContent } from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";

export function IdeaRow({
  idea,
  handle,
}: {
  idea: Idea;
  handle?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(idea.text);

  function openSheet() {
    setText(idea.text);
    setOpen(true);
  }

  function save() {
    const t = text.trim();
    if (!t) return;
    void updateIdeaText(idea.id!, t);
    setOpen(false);
  }

  // Creation feedback: rows mounting right after their createdAt pulse mint.
  // Lazy state: evaluated once per mount, keeping render pure.
  const [isNew] = useState(() => Date.now() - idea.createdAt < 1500);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5",
        isNew && "row-arrive",
      )}
    >
      <button onClick={openSheet} className="min-w-0 flex-1 text-left">
        <p className="text-[14px] text-foreground">{idea.text}</p>
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
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
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
                  void promoteIdeaToTask(idea, b.id);
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
