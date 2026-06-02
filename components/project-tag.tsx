export function ProjectTag({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{ background: `${color}22` }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
