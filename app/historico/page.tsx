"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { db } from "@/lib/db/schema";
import {
  addBacklog,
  deleteBacklog,
  promoteBacklogToProject,
  updateBacklog,
} from "@/lib/db/queries";
import { Empty } from "@/components/empty";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DueChip } from "@/components/due-chip";
import { ChecklistChip } from "@/components/checklist-chip";
import { ChecklistEditor } from "@/components/checklist-editor";
import { DuePicker } from "@/components/due-picker";
import { LinkChip } from "@/components/link-chip";
import { extractLinks } from "@/lib/links";
import { firstLines } from "@/lib/multiline";
import { cn } from "@/lib/utils";
import type { BacklogItem, Subtask } from "@/lib/types";

export default function HistoricoPage() {
  const router = useRouter();
  const items = useLiveQuery(
    async () =>
      (await db.backlog.orderBy("order").toArray()).filter(
        (b) => b.deletedAt == null,
      ),
    [],
    [],
  );
  const [text, setText] = useState("");
  const [loadedAt] = useState(() => Date.now());

  const [editing, setEditing] = useState<BacklogItem | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eSubtasks, setESubtasks] = useState<Subtask[]>([]);
  const [eDue, setEDue] = useState<number | null>(null);
  const [eDueHasTime, setEDueHasTime] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    await addBacklog(text);
    setText("");
  }

  function openSheet(item: BacklogItem) {
    setEditing(item);
    setETitle(item.title);
    setESubtasks(item.subtasks ?? []);
    setEDue(item.due ?? null);
    setEDueHasTime(item.dueHasTime ?? false);
  }

  function save() {
    if (!editing) return;
    const { title: clean, links } = extractLinks(eTitle);
    const t = clean.trim() || eTitle.trim();
    if (!t) return;
    void updateBacklog(editing.id!, {
      title: t,
      links: links.length ? [...(editing.links ?? []), ...links] : editing.links,
      subtasks: eSubtasks,
      due: eDue,
      dueHasTime: eDueHasTime,
    });
    setEditing(null);
  }

  async function promote(item: BacklogItem) {
    const id = await promoteBacklogToProject(item);
    router.push(`/projects?p=${id}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-10">
      <h1 className="font-display text-xl font-bold">Histórico</h1>
      <p className="mb-4 mt-1 text-[13px] text-muted">
        Future project ideas parked so you don’t forget. Promote one into a real
        project when you’re ready.
      </p>

      <div className="mb-4 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Park a future idea…"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
        <Button
          size="icon"
          onClick={() => void submit()}
          disabled={!text.trim()}
          aria-label="Add to histórico"
        >
          <Plus size={20} />
        </Button>
      </div>

      {items.length === 0 ? (
        <Empty
          icon={<Sparkles size={28} />}
          title="Nothing parked"
          hint="Capture ideas for future projects here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <div
              key={it.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5",
                it.createdAt > loadedAt - 1500 && "row-arrive",
              )}
            >
              <button
                onClick={() => openSheet(it)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="whitespace-pre-line text-[14px] leading-snug line-clamp-2">
                  {firstLines(it.title, 2)}
                </p>
                {(it.due != null ||
                  (it.subtasks?.length ?? 0) > 0 ||
                  (it.links?.length ?? 0) > 0) && (
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <DueChip due={it.due} dueHasTime={it.dueHasTime} />
                    <ChecklistChip subtasks={it.subtasks ?? []} />
                    {(it.links ?? []).map((l) => (
                      <LinkChip key={l} url={l} />
                    ))}
                  </span>
                )}
              </button>
              <button
                onClick={() => void promote(it)}
                aria-label="Promote to project"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-border/50 hover:text-foreground"
              >
                <ArrowUpRight size={16} />
              </button>
              <button
                onClick={() => deleteBacklog(it.id!)}
                aria-label="Delete"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent title="Edit parked idea">
          <textarea
            value={eTitle}
            onChange={(e) => setETitle(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-[14px] outline-none focus:border-primary"
          />
          <div className="mt-4">
            <DuePicker
              due={eDue}
              dueHasTime={eDueHasTime}
              onChange={(n) => {
                setEDue(n.due);
                setEDueHasTime(n.dueHasTime);
              }}
            />
          </div>
          <div className="mt-4">
            <ChecklistEditor subtasks={eSubtasks} onChange={setESubtasks} />
          </div>
          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (editing) deleteBacklog(editing.id!);
                setEditing(null);
              }}
            >
              <Trash2 size={15} /> Delete
            </Button>
            <Button size="sm" onClick={save} disabled={!eTitle.trim()}>
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
