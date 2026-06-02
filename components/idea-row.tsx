"use client";

import { useState } from "react";
import { ArrowUpRight, Trash2 } from "lucide-react";
import type { Idea } from "@/lib/types";
import { BUCKETS } from "@/lib/types";
import { deleteIdea, promoteIdeaToTask } from "@/lib/db/queries";
import { Sheet, SheetContent } from "./ui/sheet";
import { Button } from "./ui/button";

export function IdeaRow({ idea }: { idea: Idea }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
      <p className="min-w-0 flex-1 text-[14px] text-foreground">{idea.text}</p>
      <button
        onClick={() => setOpen(true)}
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Promote idea to task">
          <p className="text-[15px] text-foreground">{idea.text}</p>
          <p className="mt-4 mb-1.5 text-[12px] font-medium text-muted">Add to</p>
          <div className="grid grid-cols-3 gap-2">
            {BUCKETS.map((b) => (
              <Button
                key={b.id}
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
        </SheetContent>
      </Sheet>
    </div>
  );
}
