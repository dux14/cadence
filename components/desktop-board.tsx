"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { BUCKETS, type Bucket, type Project, type Task } from "@/lib/types";
import { resolveBucketAt, type ColumnRect } from "@/lib/drag-board";
import { BoardColumn } from "./board-column";

export function DesktopBoard() {
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const tasks = useLiveQuery(
    () => db.tasks.filter((t) => !t.archived && t.deletedAt == null).toArray(),
    [],
    [],
  );

  const projectMap = new Map<number, Project>(
    (projects ?? []).map((p) => [p.id!, p] as const),
  );

  const [dropBucket, setDropBucket] = useState<Bucket | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // Track the column the drag started in so we don't highlight the origin.
  const startBucket = useRef<Bucket | null>(null);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      const handle = (e.target as HTMLElement)?.closest("[data-drag-handle]");
      if (!handle) {
        dragging.current = false;
        return;
      }
      dragging.current = true;
      // The handle lives inside a [data-bucket] section — capture origin column.
      const col = (handle as HTMLElement).closest<HTMLElement>("[data-bucket]");
      startBucket.current = (col?.dataset.bucket as Bucket) ?? null;
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const cols: ColumnRect[] = BUCKETS.map((b) => {
        const c = el.querySelector<HTMLElement>(`[data-bucket="${b.id}"]`);
        const r = c?.getBoundingClientRect();
        return {
          bucket: b.id,
          rect: { left: r?.left ?? 0, right: r?.right ?? 0 },
        };
      });
      const over = resolveBucketAt(e.clientX, cols);
      // Only highlight if hovering a column different from the drag origin.
      setDropBucket(over && over !== startBucket.current ? over : null);
    };

    const onUp = () => {
      dragging.current = false;
      startBucket.current = null;
      setDropBucket(null);
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Sort: non-done before done, then by manual order within each group.
  // (Board intentionally does not apply the due-time sort that mobile uses —
  //  each column is a manual bucket, due is preserved but not used for ordering here.)
  function byBucket(b: Bucket): Task[] {
    return (tasks ?? [])
      .filter((t) => t.bucket === b)
      .slice()
      .sort(
        (a, z) =>
          Number(a.status === "done") - Number(z.status === "done") ||
          a.order - z.order,
      );
  }

  return (
    <div ref={boardRef} className="flex h-full gap-4 px-6 pt-6 pb-6">
      {BUCKETS.map((b) => (
        <BoardColumn
          key={b.id}
          bucket={b.id}
          label={b.label}
          tasks={byBucket(b.id)}
          projects={projectMap}
          isDropTarget={dropBucket === b.id}
          onDragStateChange={() => setDropBucket(null)}
        />
      ))}
    </div>
  );
}
