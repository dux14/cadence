"use client";

import { useState } from "react";
import Link from "next/link";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProjectCard({
  project,
  openTasks,
  ideas,
}: {
  project: Project;
  openTasks: number;
  ideas: number;
}) {
  // Creation feedback: cards mounting right after their createdAt pulse mint.
  // Lazy state: evaluated once per mount, keeping render pure.
  const [isNew] = useState(() => Date.now() - project.createdAt < 1500);
  return (
    <Link
      href={`/projects?p=${project.id}`}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition active:scale-[.99]",
        isNew && "row-arrive",
      )}
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
