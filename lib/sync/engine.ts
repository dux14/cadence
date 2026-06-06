import { db } from "@/lib/db/schema";
import type { RemoteRow, SyncClient, Table } from "@/lib/sync/types";
import { SYNC_TABLES } from "@/lib/sync/types";
import {
  getLastPushedAt,
  setLastPushedAt,
  getPullCursor,
  setPullCursor,
  getDirtyRows,
  resetSyncCursors,
} from "@/lib/sync/dirty";
import * as M from "@/lib/sync/mappers";
import type { Project, Task, Idea, BacklogItem } from "@/lib/types";

// --- serialization (FIX I3) ---
let syncChain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = syncChain.then(fn, fn);
  syncChain = next.catch(() => undefined);
  return next;
}

// --- guid helpers (local id ↔ stable guid) ---
async function projectGuidById(id: number | null | undefined): Promise<string | null> {
  if (id == null) return null;
  return (await db.projects.get(id))?.guid ?? null;
}
async function projectIdByGuid(guid: string | null): Promise<number | null> {
  if (!guid) return null;
  return (await db.projects.where("guid").equals(guid).first())?.id ?? null;
}

// --- toRemote per table (resolving relations) ---
async function rowToRemote(
  table: Exclude<Table, "photos">,
  row: unknown,
  userId: string,
): Promise<RemoteRow> {
  switch (table) {
    case "projects":
      return M.projectToRemote(row as Project, userId);
    case "tasks": {
      const t = row as Task;
      return M.taskToRemote(t, userId, await projectGuidById(t.projectId));
    }
    case "ideas": {
      const i = row as Idea;
      return M.ideaToRemote(i, userId, await projectGuidById(i.projectId));
    }
    case "backlog": {
      const b = row as BacklogItem;
      return M.backlogToRemote(b, userId, await projectGuidById(b.promotedProjectId));
    }
  }
}

const TABLE_REF = {
  projects: () => db.projects,
  tasks: () => db.tasks,
  ideas: () => db.ideas,
  backlog: () => db.backlog,
} as const;

/** Push local rows changed since the last push; advance lastPushedAt on success.
 *  FIX C1: respects the server's accepted[] — rejected rows stay dirty by
 *  rolling the cursor back below the oldest rejection. */
export async function pushTable(
  table: Exclude<Table, "photos">,
  client: SyncClient,
  userId: string,
): Promise<void> {
  const since = await getLastPushedAt(table);
  const dirty = await getDirtyRows<{ updatedAt: number; guid: string }>(table, since);
  if (dirty.length === 0) return;
  const remoteRows = await Promise.all(
    dirty.map((r) => rowToRemote(table, r, userId)),
  );
  const { accepted } = await client.upsert(table, remoteRows);
  const acceptedSet = new Set(accepted);
  const rejected = dirty.filter((r) => !acceptedSet.has(r.guid));
  let next: number;
  if (rejected.length === 0) {
    next = dirty.reduce((m, r) => Math.max(m, r.updatedAt), since);
  } else {
    // Rejected rows must stay dirty: advance only below the oldest rejection.
    // Re-pushing accepted rows above that point is harmless (idempotent upsert).
    next = rejected.reduce((m, r) => Math.min(m, r.updatedAt), Infinity) - 1;
    next = Math.max(next, since);
  }
  await setLastPushedAt(table, next);
}

/** Pull remote changes since cursor; apply LWW; honor tombstones; advance cursor. */
export async function pullTable(
  table: Exclude<Table, "photos">,
  client: SyncClient,
): Promise<void> {
  const cursor = await getPullCursor(table);
  const rows = await client.pullSince(table, cursor);
  if (rows.length === 0) return;
  let maxUpdated = cursor;
  for (const r of rows) {
    maxUpdated = Math.max(maxUpdated, r.updated_at as number);
    await applyRemoteRow(table, r);
  }
  await setPullCursor(table, maxUpdated);
}

async function applyRemoteRow(
  table: Exclude<Table, "photos">,
  r: RemoteRow,
): Promise<void> {
  const tbl = TABLE_REF[table]();
  const existing = await tbl.where("guid").equals(r.guid as string).first();
  // LWW: skip if local is strictly newer.
  if (existing && existing.updatedAt > (r.updated_at as number)) return;

  // Tombstone: delete local physically. Tie goes to remote (remote wins on equal).
  if (r.deleted_at != null) {
    if (existing?.id != null) await tbl.delete(existing.id);
    return;
  }

  if (table === "projects") {
    const data = M.projectFromRemote(r);
    if (existing?.id != null) await db.projects.update(existing.id, data);
    else await db.projects.add(data as Project);
    return;
  }
  if (table === "tasks") {
    const data = M.taskFromRemote(r);
    const projectGuid = M.taskRemoteProjectGuid(r);
    const projectId = await projectIdByGuid(projectGuid);
    // FIX I2: store _pendingProjectGuid if the project is not yet local.
    const extra: Record<string, unknown> = {};
    if (projectGuid && projectId == null) {
      extra._pendingProjectGuid = projectGuid;
    } else {
      extra._pendingProjectGuid = null;
    }
    const full = { ...data, projectId: projectId ?? null, ...extra };
    if (existing?.id != null) await db.tasks.update(existing.id, full);
    else await db.tasks.add(full as Task);
    return;
  }
  if (table === "ideas") {
    const data = M.ideaFromRemote(r);
    const projectGuid = M.ideaRemoteProjectGuid(r);
    const projectId = await projectIdByGuid(projectGuid);
    // FIX I2: Idea.projectId is required (number); use 0 as placeholder only
    // when project is absent, but ALWAYS store _pendingProjectGuid for re-resolution.
    const extra: Record<string, unknown> = {};
    if (projectGuid && projectId == null) {
      extra._pendingProjectGuid = projectGuid;
    } else {
      extra._pendingProjectGuid = null;
    }
    const full = { ...data, projectId: projectId ?? 0, ...extra };
    if (existing?.id != null) await db.ideas.update(existing.id, full);
    else await db.ideas.add(full as Idea);
    return;
  }
  if (table === "backlog") {
    const data = M.backlogFromRemote(r);
    const promotedGuid = M.backlogRemotePromotedGuid(r);
    const promotedProjectId = await projectIdByGuid(promotedGuid);
    // FIX I2: store _pendingPromotedGuid if the promoted project is not yet local.
    const extra: Record<string, unknown> = {};
    if (promotedGuid && promotedProjectId == null) {
      extra._pendingPromotedGuid = promotedGuid;
    } else {
      extra._pendingPromotedGuid = null;
    }
    const full = { ...data, promotedProjectId: promotedProjectId ?? null, ...extra };
    if (existing?.id != null) await db.backlog.update(existing.id, full);
    else await db.backlog.add(full as BacklogItem);
    return;
  }
}

/** Re-resolve orphaned guid→id relations written during a previous pull.
 *  Called after pull phase in syncOnce. Does NOT bump updatedAt (local repair,
 *  not a user edit — avoids re-push cascade; server truth is the remote guid). */
export async function resolvePendingRelations(): Promise<void> {
  // Tasks: _pendingProjectGuid
  const pendingTasks = (await db.tasks.toArray()).filter(
    (t) => (t as unknown as Record<string, unknown>)._pendingProjectGuid != null,
  );
  for (const t of pendingTasks) {
    const guid = (t as unknown as Record<string, unknown>)._pendingProjectGuid as string;
    const projectId = await projectIdByGuid(guid);
    if (projectId != null && t.id != null) {
      await db.tasks.update(t.id, { projectId, _pendingProjectGuid: null } as Partial<Task>);
    }
  }

  // Ideas: _pendingProjectGuid
  const pendingIdeas = (await db.ideas.toArray()).filter(
    (i) => (i as unknown as Record<string, unknown>)._pendingProjectGuid != null,
  );
  for (const i of pendingIdeas) {
    const guid = (i as unknown as Record<string, unknown>)._pendingProjectGuid as string;
    const projectId = await projectIdByGuid(guid);
    if (projectId != null && i.id != null) {
      await db.ideas.update(i.id, { projectId, _pendingProjectGuid: null } as Partial<Idea>);
    }
  }

  // Backlog: _pendingPromotedGuid
  const pendingBacklog = (await db.backlog.toArray()).filter(
    (b) => (b as unknown as Record<string, unknown>)._pendingPromotedGuid != null,
  );
  for (const b of pendingBacklog) {
    const guid = (b as unknown as Record<string, unknown>)._pendingPromotedGuid as string;
    const promotedProjectId = await projectIdByGuid(guid);
    if (promotedProjectId != null && b.id != null) {
      await db.backlog.update(b.id, {
        promotedProjectId,
        _pendingPromotedGuid: null,
      } as Partial<BacklogItem>);
    }
  }
}

/** One full pull/push cycle for the relational tables (photos handled apart).
 *  FIX I3: serialized so concurrent calls don't interleave. */
async function syncOnceInternal(client: SyncClient, userId: string): Promise<void> {
  const relational: Exclude<Table, "photos">[] = [
    "projects",
    "tasks",
    "ideas",
    "backlog",
  ];
  // Projects first so guid→id resolution works for children on pull.
  for (const t of relational) await pullTable(t, client);
  // FIX I2: resolve orphaned relations before pushing.
  await resolvePendingRelations();
  for (const t of relational) await pushTable(t, client, userId);
}

export async function syncOnce(client: SyncClient, userId: string): Promise<void> {
  return serialized(() => syncOnceInternal(client, userId));
}

export interface CountPair {
  local: number;
  remote: number;
}
export type CountReport = Record<Table, CountPair>;

async function localLiveCount(table: Exclude<Table, "photos">): Promise<number> {
  const all = await TABLE_REF[table]().toArray();
  return all.filter((r) => (r as { deletedAt?: number | null }).deletedAt == null)
    .length;
}

/** Compare local live counts vs remote live counts, per table. */
export async function verifyCounts(client: SyncClient): Promise<CountReport> {
  const report = {} as CountReport;
  for (const t of SYNC_TABLES) {
    const remote = await client.countLive(t);
    let local: number;
    if (t === "photos") {
      const all = await db.photos.toArray();
      local = all.filter((p) => p.deletedAt == null).length;
    } else {
      local = await localLiveCount(t);
    }
    report[t] = { local, remote };
  }
  return report;
}

export interface MigrateResult {
  ok: boolean;
  counts: CountReport;
}

/**
 * First login: force-push everything (cursor 0 = all dirty), then verify
 * counts match before declaring migration complete. On mismatch ok=false;
 * the app keeps running locally and retries later.
 * FIX I3: serialized so concurrent calls don't interleave.
 */
async function migrateInitialInternal(
  client: SyncClient,
  userId: string,
): Promise<MigrateResult> {
  await resetSyncCursors();
  const relational: Exclude<Table, "photos">[] = [
    "projects",
    "tasks",
    "ideas",
    "backlog",
  ];
  for (const t of relational) await pushTable(t, client, userId);
  // photos metadata pushed by photo queue (Task 11); blobs upload in bg.
  const counts = await verifyCounts(client);
  const ok = relational.every((t) => counts[t].local === counts[t].remote);
  return { ok, counts };
}

export async function migrateInitial(
  client: SyncClient,
  userId: string,
): Promise<MigrateResult> {
  return serialized(() => migrateInitialInternal(client, userId));
}
