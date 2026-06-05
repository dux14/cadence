"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { LayoutGrid, Plus } from "lucide-react";
import { db } from "@/lib/db/schema";
import { addProject } from "@/lib/db/queries";
import { ProjectCard } from "@/components/project-card";
import { ProjectDetail } from "@/components/project-detail";
import { Empty } from "@/components/empty";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectKind } from "@/lib/types";

function ProjectsView() {
  const router = useRouter();
  const params = useSearchParams();
  const pid = params.get("p");
  const projectId = pid ? Number(pid) : null;

  const projects = useLiveQuery(
    () => db.projects.orderBy("order").toArray(),
    [],
    [],
  );
  const tasks = useLiveQuery(
    () =>
      db.tasks
        .filter((t) => !t.archived && t.deletedAt == null && t.status !== "done")
        .toArray(),
    [],
    [],
  );
  const ideas = useLiveQuery(
    () => db.ideas.filter((i) => i.status === "open").toArray(),
    [],
    [],
  );

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProjectKind>("active");

  if (projectId != null) {
    return (
      <ProjectDetail
        projectId={projectId}
        onBack={() => {
          // Mirror the browser's Back when we got here in-app; deep links
          // (fresh tab, PWA icon) have no history to pop, so push instead.
          if (window.history.length > 1) router.back();
          else router.push("/projects");
        }}
      />
    );
  }

  const taskCount = (id: number) =>
    tasks.filter((t) => t.projectId === id).length;
  const ideaCount = (id: number) =>
    ideas.filter((i) => i.projectId === id).length;

  async function submit() {
    if (!name.trim()) return;
    await addProject(name, kind);
    setName("");
    setKind("active");
    setOpen(false);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Projects</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus size={16} /> New
        </Button>
      </header>

      {projects.length === 0 ? (
        <Empty
          icon={<LayoutGrid size={28} />}
          title="No projects yet"
          hint="Create a project or life area to group tasks and park ideas."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              openTasks={taskCount(p.id!)}
              ideas={ideaCount(p.id!)}
            />
          ))}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="New project">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project or area name…"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <div className="mt-3 flex gap-1.5">
            {(["active", "area"] as ProjectKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "flex-1 rounded-full px-2 py-1.5 text-[12px] font-medium transition",
                  kind === k
                    ? "bg-primary text-primary-ink"
                    : "border border-border text-muted",
                )}
              >
                {k === "active" ? "Project" : "Life area"}
              </button>
            ))}
          </div>
          <Button
            className="mt-5 w-full"
            onClick={() => void submit()}
            disabled={!name.trim()}
          >
            Create
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsView />
    </Suspense>
  );
}
