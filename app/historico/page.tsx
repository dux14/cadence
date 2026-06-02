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
} from "@/lib/db/queries";
import { Empty } from "@/components/empty";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { BacklogItem } from "@/lib/types";

export default function HistoricoPage() {
  const router = useRouter();
  const items = useLiveQuery(() => db.backlog.orderBy("order").toArray(), [], []);
  const [text, setText] = useState("");

  async function submit() {
    if (!text.trim()) return;
    await addBacklog(text);
    setText("");
  }

  async function promote(item: BacklogItem) {
    const id = await promoteBacklogToProject(item);
    router.push(`/projects?p=${id}`);
  }

  return (
    <div className="px-4 pt-5">
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
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <p className="min-w-0 flex-1 text-[14px]">{it.title}</p>
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
    </div>
  );
}
