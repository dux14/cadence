"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { History as HistoryIcon, ListChecks } from "lucide-react";
import { db } from "@/lib/db/schema";
import { Logo } from "@/components/logo";
import { Segmented } from "@/components/segmented";
import { TaskList } from "@/components/task-list";
import { QuickAdd } from "@/components/quick-add";
import { Empty } from "@/components/empty";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatDayLabel } from "@/lib/date";
import type { Bucket, Project } from "@/lib/types";

export default function TodayPage() {
  const [bucket, setBucket] = useState<Bucket>("today");

  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const tasks = useLiveQuery(
    () =>
      db.tasks
        .where("bucket")
        .equals(bucket)
        .filter((t) => !t.archived)
        .toArray(),
    [bucket],
    [],
  );
  const counts = useLiveQuery(async () => {
    const all = await db.tasks.filter((t) => !t.archived).toArray();
    return {
      today: all.filter((t) => t.bucket === "today" && t.status === "open")
        .length,
      tomorrow: all.filter((t) => t.bucket === "tomorrow").length,
      week: all.filter((t) => t.bucket === "week").length,
    };
  }, []);

  const projectMap = new Map<number, Project>(
    projects.map((p) => [p.id!, p] as const),
  );
  // Open before done; timed tasks first (ascending), untimed keep manual order.
  const timeCmp = (a?: string | null, b?: string | null) =>
    a && b ? a.localeCompare(b) : Number(!!b) - Number(!!a);
  const sorted = tasks
    .slice()
    .sort(
      (a, b) =>
        Number(a.status === "done") - Number(b.status === "done") ||
        timeCmp(a.time, b.time) ||
        a.order - b.order,
    );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={30} className="md:hidden" />
          <div>
            <h1 className="font-display text-xl font-bold leading-none">
              Today
            </h1>
            <p className="mt-1 text-[12px] text-muted">{formatDayLabel()}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/history"
            aria-label="History"
            className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-border/50 hover:text-foreground"
          >
            <HistoryIcon size={18} />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="sticky top-0 z-20 -mx-4 bg-background/90 px-4 py-2 backdrop-blur">
        <Segmented value={bucket} onChange={setBucket} counts={counts} />
      </div>

      <div className="mt-3">
        {sorted.length === 0 ? (
          <Empty
            icon={<ListChecks size={28} />}
            title="Nothing here yet"
            hint="Tap + to capture a task. Paste a link and it becomes a chip."
          />
        ) : (
          <TaskList tasks={sorted} projects={projectMap} />
        )}
      </div>

      <QuickAdd defaultBucket={bucket} />
    </div>
  );
}
