import { Image as ImageIcon } from "lucide-react";

/** Single preview chip: photo icon + count. Hidden when count is 0. */
export function PhotoChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-border/60 px-1.5 py-0.5 text-[11px] text-muted">
      <ImageIcon size={11} /> {count}
    </span>
  );
}
