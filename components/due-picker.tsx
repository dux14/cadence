"use client";

import { CalendarDays } from "lucide-react";
import { dueToInputs, inputsToDue } from "@/lib/due";

export function DuePicker({
  due,
  dueHasTime,
  onChange,
}: {
  due?: number | null;
  dueHasTime?: boolean;
  onChange: (next: { due: number | null; dueHasTime: boolean }) => void;
}) {
  const { date, time } =
    due != null
      ? dueToInputs(due, dueHasTime ?? false)
      : { date: "", time: "" };

  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-muted">Due</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] text-muted">
          <CalendarDays size={12} />
          <input
            type="date"
            value={date}
            onChange={(e) => onChange(inputsToDue(e.target.value, time))}
            aria-label="Due date"
            className="bg-transparent text-foreground outline-none"
          />
        </label>
        <input
          type="time"
          value={time}
          disabled={!date}
          onChange={(e) => onChange(inputsToDue(date, e.target.value))}
          aria-label="Due time"
          className="rounded-full border border-border bg-transparent px-2.5 py-1 text-[12px] text-foreground outline-none disabled:opacity-40"
        />
        {date && (
          <button
            type="button"
            onClick={() => onChange({ due: null, dueHasTime: false })}
            className="text-[12px] text-muted transition hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
