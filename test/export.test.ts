import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { db } from "@/lib/db/schema";
import { addProject, addTask } from "@/lib/db/queries";
import { exportSnapshot } from "@/lib/export";

beforeEach(async () => {
  db.close();
  await Dexie.delete("cadence");
  await db.open();
});

describe("exportSnapshot", () => {
  it("includes every table and a version + timestamp", async () => {
    const pid = await addProject("HKN", "active");
    await addTask({ title: "task", projectId: pid, bucket: "today" });

    const snap = await exportSnapshot();
    expect(snap.version).toBe(2);
    expect(typeof snap.exportedAt).toBe("number");
    expect(snap.projects.length).toBe(1);
    expect(snap.tasks.length).toBe(1);
    expect(Array.isArray(snap.ideas)).toBe(true);
    expect(Array.isArray(snap.backlog)).toBe(true);
    expect(Array.isArray(snap.meta)).toBe(true);
  });

  it("includes tombstoned rows (full backup, not filtered)", async () => {
    const pid = await addProject("HKN", "active");
    const tid = await addTask({ title: "task", projectId: pid, bucket: "today" });
    await db.tasks.update(tid, { deletedAt: Date.now() });
    const snap = await exportSnapshot();
    expect(snap.tasks.length).toBe(1); // tombstone still backed up
  });
});
