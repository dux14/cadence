"use client";

import { cn } from "@/lib/utils";
import { BUCKETS, type Bucket } from "@/lib/types";

export function Segmented({
  value,
  onChange,
  counts,
}: {
  value: Bucket;
  onChange: (b: Bucket) => void;
  counts?: Partial<Record<Bucket, number>>;
}) {
  return (
    <div className="flex gap-1.5">
      {BUCKETS.map((b) => {
        const active = value === b.id;
        const count = counts?.[b.id] ?? 0;
        return (
          <button
            key={b.id}
            onClick={() => onChange(b.id)}
            className={cn(
              "flex-1 rounded-full px-2 py-2 text-[13px] font-medium transition",
              active
                ? "bg-primary text-primary-ink"
                : "border border-border bg-surface text-muted",
            )}
          >
            {b.label}
            {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
