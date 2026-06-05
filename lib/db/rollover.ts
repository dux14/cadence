import { db, getMeta, setMeta } from "@/lib/db/schema";
import { localDateKey } from "@/lib/date";

/**
 * Replays every day boundary crossed since the app was last opened:
 *  - done "today" tasks      -> archived (kept for History)
 *  - non-done "today" tasks  -> stay in Today, flagged `carried` (status kept)
 *  - "tomorrow" tasks         -> promoted to Today
 *  - "week" tasks             -> untouched
 *
 * Tombstoned rows (deletedAt != null) are ignored throughout.
 * Idempotent: a no-op when already run for the current local day.
 * Returns true if a rollover actually happened.
 */
export async function runRollover(): Promise<boolean> {
  const today = localDateKey();
  const last = await getMeta<string | null>("lastOpenedDay", null);
  if (last === today) return false;

  await db.transaction("rw", db.tasks, db.meta, async () => {
    const now = Date.now();

    const todayTasks = await db.tasks
      .where("bucket")
      .equals("today")
      .filter((t) => !t.archived && t.deletedAt == null)
      .toArray();

    for (const t of todayTasks) {
      if (t.status === "done") {
        await db.tasks.update(t.id!, {
          archived: true,
          archivedAt: now,
          updatedAt: now,
        });
      } else if (!t.carried) {
        await db.tasks.update(t.id!, { carried: true, updatedAt: now });
      }
    }

    const tomorrow = await db.tasks
      .where("bucket")
      .equals("tomorrow")
      .filter((t) => !t.archived && t.deletedAt == null)
      .toArray();

    for (const t of tomorrow) {
      await db.tasks.update(t.id!, {
        bucket: "today",
        dayKey: today,
        updatedAt: now,
      });
    }

    await setMeta("lastOpenedDay", today);
  });

  return true;
}
