"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Lightbulb, ListChecks, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db/schema";
import { addIdea, deleteProject } from "@/lib/db/queries";
import { TaskList } from "./task-list";
import { IdeaRow } from "./idea-row";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import type { Project } from "@/lib/types";

export function ProjectDetail({
  projectId,
  onBack,
}: {
  projectId: number;
  onBack: () => void;
}) {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const tasks = useLiveQuery(
    () =>
      db.tasks
        .where("projectId")
        .equals(projectId)
        .filter((t) => !t.archived)
        .toArray(),
    [projectId],
    [],
  );
  const ideas = useLiveQuery(
    () =>
      db.ideas
        .where("projectId")
        .equals(projectId)
        .filter((i) => i.status === "open")
        .toArray(),
    [projectId],
    [],
  );
  const [idea, setIdea] = useState("");

  if (!project) return null;

  const projectMap = new Map<number, Project>([[project.id!, project]]);
  const sortedTasks = tasks
    .slice()
    .sort(
      (a, b) =>
        Number(a.status === "done") - Number(b.status === "done") ||
        a.order - b.order,
    );
  const sortedIdeas = ideas.slice().sort((a, b) => a.order - b.order);

  async function submitIdea() {
    if (!idea.trim()) return;
    await addIdea(projectId, idea);
    setIdea("");
  }

  return (
    <div className="px-4 pt-5">
      <header className="mb-5 flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Back to projects"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-border/50 hover:text-foreground"
        >
          <ArrowLeft size={18} />
        </button>
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl font-display text-[15px] font-bold text-foreground"
          style={{ background: `${project.color}33` }}
        >
          {project.name.charAt(0).toUpperCase()}
        </span>
        <h1 className="flex-1 truncate font-display text-lg font-bold">
          {project.name}
        </h1>
        <button
          onClick={() => {
            if (
              confirm(
                "Delete this project? Its ideas are removed; tasks are kept and unlinked.",
              )
            ) {
              void deleteProject(projectId);
              onBack();
            }
          }}
          aria-label="Delete project"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:text-danger"
        >
          <Trash2 size={16} />
        </button>
      </header>

      <section className="mb-7">
        <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted">
          <ListChecks size={15} /> Tasks
        </h2>
        {sortedTasks.length === 0 ? (
          <p className="px-1 text-[13px] text-muted">
            No tasks yet. Add one from Today with this project selected, or
            promote an idea below.
          </p>
        ) : (
          <TaskList tasks={sortedTasks} projects={projectMap} />
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted">
          <Lightbulb size={15} /> Ideas
        </h2>
        <div className="mb-3 flex gap-2">
          <Input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Capture an improvement…"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitIdea();
            }}
          />
          <Button
            size="icon"
            onClick={() => void submitIdea()}
            disabled={!idea.trim()}
            aria-label="Add idea"
          >
            <Plus size={20} />
          </Button>
        </div>
        {sortedIdeas.length === 0 ? (
          <p className="px-1 text-[13px] text-muted">
            No ideas parked. Jot improvements here; promote any into a task.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedIdeas.map((i) => (
              <IdeaRow key={i.id} idea={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
