"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import type { Subtask } from "@/lib/types";
import { newGuid } from "@/lib/id";
import { cn } from "@/lib/utils";

export function ChecklistEditor({
  subtasks,
  onChange,
}: {
  subtasks: Subtask[];
  onChange: (next: Subtask[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const done = subtasks.filter((s) => s.done).length;

  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange([...subtasks, { id: newGuid(), text: t, done: false }]);
    setDraft("");
  }

  function toggle(id: string) {
    onChange(subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }

  function remove(id: string) {
    onChange(subtasks.filter((s) => s.id !== id));
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[12px] font-medium text-muted">Checklist</p>
        {subtasks.length > 0 && (
          <span className="text-[11px] text-muted">
            {done}/{subtasks.length}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              aria-label={s.done ? "Mark not done" : "Mark done"}
              onClick={() => toggle(s.id)}
              className={cn(
                "grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition",
                s.done
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-primary text-transparent",
              )}
            >
              <Check size={10} strokeWidth={3} />
            </button>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13px]",
                s.done && "text-muted line-through",
              )}
            >
              {s.text}
            </span>
            <button
              type="button"
              aria-label="Remove item"
              onClick={() => remove(s.id)}
              className="text-muted transition hover:text-danger"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a step…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
        />
        <button
          type="button"
          aria-label="Add step"
          onClick={add}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted transition hover:text-foreground"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
