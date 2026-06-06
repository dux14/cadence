import { useEffect, useRef, useState } from "react";
import type { Bucket } from "./types";

export interface TransferConfig {
  /** Bucket this list/column belongs to. */
  bucket: Bucket;
  /** Called on pointer-up when the item is dropped onto a different column. */
  onTransfer: (id: number, toBucket: Bucket) => void;
}

/**
 * Pointer-event drag-to-reorder shared by the task and idea lists (works on
 * touch + mouse, no external dependency). Items swap as the pointer crosses a
 * row's midpoint; `commit` receives the final id order on release.
 *
 * Optional 2-D mode (`transfer`): when the pointer leaves the current column
 * and enters another (detected via `[data-bucket]` under the cursor), releasing
 * calls `onTransfer(id, toBucket)` instead of `commit`. `dropBucket` exposes
 * the candidate destination column for rendering a drop indicator.
 *
 * NOTE — stale-closure safety: `handleProps` is recreated on every render (it
 * is an inner function), and callers spread it with `{...handleProps(id)}` on
 * each render. React therefore re-binds `onPointerUp` to the latest closure
 * every time the component re-renders, so `order` inside `onUp` is always
 * current. No ref for `order` is needed.
 */
export function useDragReorder<T extends { id?: number }>(
  items: T[],
  commit: (orderedIds: number[]) => void,
  transfer?: TransferConfig,
) {
  const [order, setOrder] = useState<T[]>(items);
  const dragId = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropBucket, setDropBucket] = useState<Bucket | null>(null);
  const dropBucketRef = useRef<Bucket | null>(null);
  const rowRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Resync when the underlying data changes (toggles, adds, edits).
  useEffect(() => {
    if (dragId.current === null) setOrder(items);
  }, [items]);

  function rowRef(id: number) {
    return (el: HTMLElement | null) => {
      if (el) rowRefs.current.set(id, el);
      else rowRefs.current.delete(id);
    };
  }

  function setDrop(b: Bucket | null) {
    dropBucketRef.current = b;
    setDropBucket(b);
  }

  function onMove(e: React.PointerEvent) {
    if (dragId.current === null) return;

    // 2-D mode: check whether the pointer is over a different column.
    if (transfer) {
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-bucket]");
      const overBucket = el?.dataset.bucket as Bucket | undefined;
      if (overBucket && overBucket !== transfer.bucket) {
        setDrop(overBucket);
        // Skip vertical reorder while aiming at another column.
        return;
      }
      if (dropBucketRef.current !== null) setDrop(null);
    }

    // Vertical reorder within the current column (original 1-D logic).
    const y = e.clientY;
    for (const [id, el] of rowRefs.current) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        if (id !== dragId.current) {
          setOrder((prev) => {
            const from = prev.findIndex((t) => t.id === dragId.current);
            const to = prev.findIndex((t) => t.id === id);
            if (from < 0 || to < 0 || from === to) return prev;
            const next = prev.slice();
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
          });
        }
        break;
      }
    }
  }

  function onUp() {
    const id = dragId.current;
    if (id !== null) {
      const target = dropBucketRef.current;
      if (transfer && target && target !== transfer.bucket) {
        transfer.onTransfer(id, target);
      } else {
        commit(order.map((t) => t.id!));
      }
    }
    dragId.current = null;
    setDraggingId(null);
    setDrop(null);
  }

  /** Spread onto the drag-handle element of row `id`. */
  function handleProps(id: number) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        dragId.current = id;
        setDraggingId(id);
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerCancel: onUp,
    };
  }

  return { order, draggingId, dropBucket, rowRef, handleProps };
}
