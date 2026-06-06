import type { Bucket } from "./types";

export interface DOMRectLike {
  left: number;
  right: number;
}

export interface ColumnRect {
  bucket: Bucket;
  rect: DOMRectLike;
}

export function resolveBucketAt(x: number, columns: ColumnRect[]): Bucket | null {
  if (columns.length === 0) return null;
  // Direct hit: x dentro del span horizontal de una columna.
  for (const c of columns) {
    if (x >= c.rect.left && x <= c.rect.right) return c.bucket;
  }
  // Fuera de límites: clamp a la columna de borde más cercana.
  const first = columns[0];
  if (x < first.rect.left) return first.bucket;
  const last = columns[columns.length - 1];
  return last.bucket;
}

export function applyReorder(ids: number[], dragId: number, overId: number): number[] {
  if (dragId === overId) return ids;
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0) return ids;
  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function applyTransfer(
  board: Partial<Record<Bucket, number[]>>,
  id: number,
  from: Bucket,
  to: Bucket,
  overId?: number,
): Partial<Record<Bucket, number[]>> {
  if (from === to) return board;
  const src = (board[from] ?? []).filter((x) => x !== id);
  const dstPrev = board[to] ?? [];
  let dst: number[];
  if (overId != null) {
    const at = dstPrev.indexOf(overId);
    dst = dstPrev.slice();
    dst.splice(at < 0 ? dst.length : at, 0, id);
  } else {
    dst = [...dstPrev, id];
  }
  return { ...board, [from]: src, [to]: dst };
}
