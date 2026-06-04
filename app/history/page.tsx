"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, History as HistoryIcon } from "lucide-react";
import { db } from "@/lib/db/schema";
import { Empty } from "@/components/empty";
import { ProjectTag } from "@/components/project-tag";
import { formatHistoryDate, localDateKey } from "@/lib/date";
import type { Project, Task } from "@/lib/types";

export default function HistoryPage() {
  const tasks = useLiveQuery(
    () => db.tasks.filter((t) => !!t.archived).toArray(),
    [],
    [],
  );
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const projectMap = new Map<number, Project>(
    projects.map((p) => [p.id!, p] as const),
  );

  const groups = new Map<string, Task[]>();
  for (const t of tasks
    .slice()
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))) {
    const key = localDateKey(
      new Date(t.completedAt ?? t.archivedAt ?? Date.now()),
    );
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-10">
      <header className="mb-4 flex items-center gap-2">
        <Link
          href="/"
          aria-label="Back to today"
          className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-border/50 hover:text-foreground"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="font-display text-xl font-bold">History</h1>
      </header>

      {groups.size === 0 ? (
        <Empty
          icon={<HistoryIcon size={28} />}
          title="No history yet"
          hint="Completed tasks land here after the day rolls over."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
                {formatHistoryDate(day)}
              </h2>
              <div className="flex flex-col gap-2">
                {items.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5"
                  >
                    <Check size={14} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-[14px] text-muted line-through">
                      {t.title}
                    </span>
                    {t.projectId && projectMap.get(t.projectId) && (
                      <ProjectTag
                        name={projectMap.get(t.projectId)!.name}
                        color={projectMap.get(t.projectId)!.color}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
