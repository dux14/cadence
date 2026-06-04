import { useEffect, useRef, useState } from "react";

/**
 * Pointer-event drag-to-reorder shared by the task and idea lists (works on
 * touch + mouse, no external dependency). Items swap as the pointer crosses a
 * row's midpoint; `commit` receives the final id order on release.
 */
export function useDragReorder<T extends { id?: number }>(
  items: T[],
  commit: (orderedIds: number[]) => void,
) {
  const [order, setOrder] = useState<T[]>(items);
  const dragId = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
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

  function onMove(e: React.PointerEvent) {
    if (dragId.current === null) return;
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
    if (dragId.current !== null) commit(order.map((t) => t.id!));
    dragId.current = null;
    setDraggingId(null);
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

  return { order, draggingId, rowRef, handleProps };
}
