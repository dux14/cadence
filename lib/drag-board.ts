import type { Bucket } from "./types";

/** Bucket adyacente en la dirección dada, o null en el borde. */
export function adjacentBucket(
  current: Bucket,
  dir: -1 | 1,
  buckets: readonly Bucket[],
): Bucket | null {
  const idx = buckets.indexOf(current);
  if (idx < 0) return null;
  const next = idx + dir;
  if (next < 0 || next >= buckets.length) return null;
  return buckets[next];
}

/** Mueve `id` un offset dentro de `ids`; null si id ausente o el movimiento sale del rango (no-op). */
export function moveByOffset(
  ids: number[],
  id: number,
  offset: number,
): number[] | null {
  const from = ids.indexOf(id);
  if (from < 0) return null;
  const to = from + offset;
  if (to < 0 || to >= ids.length) return null;
  const next = ids.slice();
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** Horizontal span only — top/bottom intentionally omitted. */
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
  // No direct hit (x cae en un hueco entre columnas, o fuera de rango).
  // Devuelve la columna cuyo borde (left o right) esté a distancia mínima de x.
  // Esto cubre automáticamente los clamps fuera de rango (x antes del primer
  // left → primera columna; x después del último right → última columna).
  let nearest = columns[0];
  let minDist = Math.min(Math.abs(x - nearest.rect.left), Math.abs(x - nearest.rect.right));
  for (let i = 1; i < columns.length; i++) {
    const c = columns[i];
    const dist = Math.min(Math.abs(x - c.rect.left), Math.abs(x - c.rect.right));
    if (dist < minDist) {
      minDist = dist;
      nearest = c;
    }
  }
  return nearest.bucket;
}

/** Precondition: ids must be unique (DB auto-increment). */
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

/**
 * Moves `id` from bucket `from` to bucket `to`.
 *
 * - `overId` absent or equal to `id`: inserts at the end of the destination.
 * - `overId` present but not found in destination: also inserts at the end.
 * - `id` absent in source: caller controls state; src filter is a no-op and
 *   the id is still inserted into the destination as requested.
 */
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
