import Link from "next/link";
import type { Project } from "@/lib/types";

export function ProjectCard({
  project,
  openTasks,
  ideas,
}: {
  project: Project;
  openTasks: number;
  ideas: number;
}) {
  return (
    <Link
      href={`/projects?p=${project.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition active:scale-[.99]"
    >
      <div className="flex items-start justify-between">
        <span
          className="grid h-9 w-9 place-items-center rounded-xl font-display text-[15px] font-bold text-foreground"
          style={{ background: `${project.color}33` }}
        >
          {project.name.charAt(0).toUpperCase()}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {project.kind === "area" ? "Area" : "Project"}
        </span>
      </div>
      <h3 className="font-display text-[15px] font-semibold leading-tight">
        {project.name}
      </h3>
      <div className="flex gap-3 text-[12px] text-muted">
        <span>{openTasks} open</span>
        <span>{ideas} ideas</span>
      </div>
    </Link>
  );
}
