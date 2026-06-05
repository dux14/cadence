import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { db, setMeta } from "@/lib/db/schema";
import { addTask, deleteTask } from "@/lib/db/queries";
import { runRollover } from "@/lib/db/rollover";
import { localDateKey } from "@/lib/date";

beforeEach(async () => {
  db.close();
  await Dexie.delete("cadence");
  await db.open();
});

describe("runRollover v2", () => {
  it("archives done today tasks and carries non-done ones, preserving status", async () => {
    const doneId = await addTask({ title: "done", bucket: "today" });
    const blockedId = await addTask({ title: "blocked", bucket: "today" });
    await db.tasks.update(doneId, { status: "done" });
    await db.tasks.update(blockedId, { status: "blocked" });
    // Force a previous opened-day so rollover runs.
    await setMeta("lastOpenedDay", "2000-01-01");

    const ran = await runRollover();
    expect(ran).toBe(true);

    const done = (await db.tasks.get(doneId))!;
    expect(done.archived).toBe(true);

    const blocked = (await db.tasks.get(blockedId))!;
    expect(blocked.status).toBe("blocked"); // preserved
    expect(blocked.carried).toBe(true);
  });

  it("promotes tomorrow tasks to today and ignores tombstoned rows", async () => {
    const tomorrowId = await addTask({ title: "tmrw", bucket: "tomorrow" });
    const goneId = await addTask({ title: "gone", bucket: "tomorrow" });
    await deleteTask(goneId);
    await setMeta("lastOpenedDay", "2000-01-01");

    await runRollover();

    expect((await db.tasks.get(tomorrowId))!.bucket).toBe("today");
    // Tombstoned row stays put (not silently revived).
    const gone = (await db.tasks.get(goneId))!;
    expect(gone.bucket).toBe("tomorrow");
    expect(gone.deletedAt).not.toBeNull();
  });

  it("is a no-op when already run today", async () => {
    await setMeta("lastOpenedDay", localDateKey());
    expect(await runRollover()).toBe(false);
  });
});
