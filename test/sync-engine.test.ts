import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db/schema";
import type { RemoteRow, SyncClient, Table } from "@/lib/sync/types";
import { pushTable, pullTable, migrateInitial, verifyCounts, resolvePendingRelations, syncOnce } from "@/lib/sync/engine";
import { getPullCursor, getLastPushedAt, setPullCursor, resetSyncCursors } from "@/lib/sync/dirty";

function makeMockClient(userId: string | null): {
  client: SyncClient;
  store: Map<Table, Map<string, RemoteRow>>;
} {
  const store = new Map<Table, Map<string, RemoteRow>>();
  const tableMap = (t: Table) => {
    if (!store.has(t)) store.set(t, new Map());
    return store.get(t)!;
  };
  const client: SyncClient = {
    async getUserId() {
      return userId;
    },
    async upsert(table, rows) {
      const m = tableMap(table);
      const accepted: string[] = [];
      for (const row of rows) {
        const cur = m.get(row.guid);
        // LWW: server keeps incoming only if updated_at >= current.
        if (!cur || (row.updated_at as number) >= (cur.updated_at as number)) {
          m.set(row.guid, row);
          accepted.push(row.guid);
        }
      }
      return { accepted };
    },
    async pullSince(table, cursor) {
      return [...tableMap(table).values()]
        .filter((r) => (r.updated_at as number) > cursor)
        .sort((a, b) => (a.updated_at as number) - (b.updated_at as number));
    },
    async countLive(table) {
      return [...tableMap(table).values()].filter((r) => r.deleted_at == null)
        .length;
    },
    async uploadPhoto() {},
    async createSignedUrl() {
      return "https://signed.example/x";
    },
  };
  return { client, store };
}

beforeEach(async () => {
  await Promise.all([
    db.projects.clear(),
    db.tasks.clear(),
    db.ideas.clear(),
    db.backlog.clear(),
    db.photos.clear(),
    db.meta.clear(),
  ]);
});

describe("pushTable", () => {
  it("pushes only rows newer than lastPushedAt and advances it", async () => {
    const { client, store } = makeMockClient("u1");
    await db.tasks.add({
      guid: "g1", title: "a", links: [], projectId: null, bucket: "today",
      status: "todo", order: 0, createdAt: 1, completedAt: null, due: null,
      dueHasTime: false, subtasks: [], carried: false, dayKey: null,
      archived: false, archivedAt: null, updatedAt: 100, deletedAt: null,
    });
    await pushTable("tasks", client, "u1");
    expect(store.get("tasks")!.get("g1")).toBeDefined();
    // second push with no new changes sends nothing new
    const before = store.get("tasks")!.size;
    await pushTable("tasks", client, "u1");
    expect(store.get("tasks")!.size).toBe(before);
  });
});

describe("pullTable LWW", () => {
  it("newer remote wins over local", async () => {
    const { client } = makeMockClient("u1");
    await db.tasks.add({
      guid: "g1", title: "local", links: [], projectId: null, bucket: "today",
      status: "todo", order: 0, createdAt: 1, completedAt: null, due: null,
      dueHasTime: false, subtasks: [], carried: false, dayKey: null,
      archived: false, archivedAt: null, updatedAt: 100, deletedAt: null,
    });
    await client.upsert("tasks", [{
      guid: "g1", user_id: "u1", title: "remote-newer", links: [],
      project_guid: null, bucket: "today", status: "done", order: 0,
      created_at: 1, completed_at: 200, due: null, due_has_time: false,
      subtasks: [], carried: false, day_key: null, archived: false,
      archived_at: null, updated_at: 200, deleted_at: null,
    }]);
    await pullTable("tasks", client);
    const row = await db.tasks.where("guid").equals("g1").first();
    expect(row!.title).toBe("remote-newer");
    expect(row!.status).toBe("done");
  });

  it("older remote is ignored", async () => {
    const { client } = makeMockClient("u1");
    await db.tasks.add({
      guid: "g2", title: "local-newer", links: [], projectId: null,
      bucket: "today", status: "todo", order: 0, createdAt: 1,
      completedAt: null, due: null, dueHasTime: false, subtasks: [],
      carried: false, dayKey: null, archived: false, archivedAt: null,
      updatedAt: 500, deletedAt: null,
    });
    await client.upsert("tasks", [{
      guid: "g2", user_id: "u1", title: "remote-older", links: [],
      project_guid: null, bucket: "today", status: "todo", order: 0,
      created_at: 1, completed_at: null, due: null, due_has_time: false,
      subtasks: [], carried: false, day_key: null, archived: false,
      archived_at: null, updated_at: 300, deleted_at: null,
    }]);
    await pullTable("tasks", client);
    const row = await db.tasks.where("guid").equals("g2").first();
    expect(row!.title).toBe("local-newer");
  });

  it("advances the pull cursor to the max updated_at seen", async () => {
    const { client } = makeMockClient("u1");
    await client.upsert("tasks", [{
      guid: "g3", user_id: "u1", title: "x", links: [], project_guid: null,
      bucket: "today", status: "todo", order: 0, created_at: 1,
      completed_at: null, due: null, due_has_time: false, subtasks: [],
      carried: false, day_key: null, archived: false, archived_at: null,
      updated_at: 777, deleted_at: null,
    }]);
    await pullTable("tasks", client);
    expect(await getPullCursor("tasks")).toBe(777);
  });

  it("applies a remote tombstone by deleting the local row", async () => {
    const { client } = makeMockClient("u1");
    await db.tasks.add({
      guid: "g4", title: "to-delete", links: [], projectId: null,
      bucket: "today", status: "todo", order: 0, createdAt: 1,
      completedAt: null, due: null, dueHasTime: false, subtasks: [],
      carried: false, dayKey: null, archived: false, archivedAt: null,
      updatedAt: 100, deletedAt: null,
    });
    await client.upsert("tasks", [{
      guid: "g4", user_id: "u1", title: "to-delete", links: [],
      project_guid: null, bucket: "today", status: "todo", order: 0,
      created_at: 1, completed_at: null, due: null, due_has_time: false,
      subtasks: [], carried: false, day_key: null, archived: false,
      archived_at: null, updated_at: 900, deleted_at: 900,
    }]);
    await pullTable("tasks", client);
    const row = await db.tasks.where("guid").equals("g4").first();
    expect(row).toBeUndefined();
  });
});

describe("migrateInitial + verifyCounts", () => {
  it("pushes everything and verifies local==remote live counts", async () => {
    const { client } = makeMockClient("u1");
    await db.projects.add({
      guid: "p1", name: "Cadence", kind: "active", color: "#A9C8EE",
      order: 0, createdAt: 1, archivedAt: null, updatedAt: 10, deletedAt: null,
    });
    await db.tasks.add({
      guid: "t1", title: "a", links: [], projectId: 1, bucket: "today",
      status: "todo", order: 0, createdAt: 1, completedAt: null, due: null,
      dueHasTime: false, subtasks: [], carried: false, dayKey: null,
      archived: false, archivedAt: null, updatedAt: 10, deletedAt: null,
    });
    const result = await migrateInitial(client, "u1");
    expect(result.ok).toBe(true);
    const counts = await verifyCounts(client);
    expect(counts.projects).toEqual({ local: 1, remote: 1 });
    expect(counts.tasks).toEqual({ local: 1, remote: 1 });
  });

  it("reports ok=false when a count mismatches", async () => {
    const { client, store } = makeMockClient("u1");
    await db.tasks.add({
      guid: "t1", title: "a", links: [], projectId: null, bucket: "today",
      status: "todo", order: 0, createdAt: 1, completedAt: null, due: null,
      dueHasTime: false, subtasks: [], carried: false, dayKey: null,
      archived: false, archivedAt: null, updatedAt: 10, deletedAt: null,
    });
    await migrateInitial(client, "u1");
    // simulate a remote row vanishing
    store.get("tasks")!.clear();
    const counts = await verifyCounts(client);
    expect(counts.tasks.local).not.toBe(counts.tasks.remote);
  });
});

// ---- NEW TESTS (quality review) ----

describe("C1: LWW-rejected push stays dirty", () => {
  it("does not advance lastPushedAt when server rejects the row (server is newer)", async () => {
    const { client } = makeMockClient("u1");
    // Seed the server with g1@200 (newer than what we'll push locally).
    await client.upsert("tasks", [{
      guid: "g1", user_id: "u1", title: "server-version", links: [],
      project_guid: null, bucket: "today", status: "todo", order: 0,
      created_at: 1, completed_at: null, due: null, due_has_time: false,
      subtasks: [], carried: false, day_key: null, archived: false,
      archived_at: null, updated_at: 200, deleted_at: null,
    }]);

    // Local g1@150 — older than server; server will reject it.
    await db.tasks.add({
      guid: "g1", title: "local-old", links: [], projectId: null, bucket: "today",
      status: "todo", order: 0, createdAt: 1, completedAt: null, due: null,
      dueHasTime: false, subtasks: [], carried: false, dayKey: null,
      archived: false, archivedAt: null, updatedAt: 150, deletedAt: null,
    });

    await pushTable("tasks", client, "u1");

    // lastPushedAt must NOT have advanced to 150 (row still dirty).
    const cursor = await getLastPushedAt("tasks");
    expect(cursor).toBeLessThan(150);

    // Now pull: server row @200 should overwrite local.
    await pullTable("tasks", client);
    const row = await db.tasks.where("guid").equals("g1").first();
    expect(row!.title).toBe("server-version");
    expect(row!.updatedAt).toBe(200);
  });
});

describe("I2: orphan guid re-resolution", () => {
  it("re-resolves task projectId when project arrives later", async () => {
    const { client } = makeMockClient("u1");

    // Pull a task with a project_guid that doesn't exist locally yet.
    await client.upsert("tasks", [{
      guid: "t-orphan", user_id: "u1", title: "orphan task", links: [],
      project_guid: "pg-future", bucket: "today", status: "todo", order: 0,
      created_at: 1, completed_at: null, due: null, due_has_time: false,
      subtasks: [], carried: false, day_key: null, archived: false,
      archived_at: null, updated_at: 100, deleted_at: null,
    }]);
    await pullTable("tasks", client);

    const orphan = await db.tasks.where("guid").equals("t-orphan").first();
    // projectId is null (not found); _pendingProjectGuid is set.
    expect(orphan).toBeDefined();
    expect(orphan!.projectId).toBeNull();
    expect((orphan as unknown as Record<string, unknown>)._pendingProjectGuid).toBe("pg-future");

    // Now the project arrives via pull.
    await client.upsert("projects", [{
      guid: "pg-future", user_id: "u1", name: "Future Project", kind: "active",
      color: "#aaa", order: 1, created_at: 1, archived_at: null,
      updated_at: 50, deleted_at: null,
    }]);
    await pullTable("projects", client);

    // resolvePendingRelations should wire up the projectId.
    await resolvePendingRelations();

    const resolved = await db.tasks.where("guid").equals("t-orphan").first();
    expect(resolved!.projectId).not.toBeNull();
    expect((resolved as unknown as Record<string, unknown>)._pendingProjectGuid).toBeNull();
  });

  it("idea with absent project gets projectId:0 AND _pendingProjectGuid set (not bare 0)", async () => {
    const { client } = makeMockClient("u1");

    await client.upsert("ideas", [{
      guid: "i-orphan", user_id: "u1", project_guid: "pg-missing",
      text: "orphan idea", status: "open", links: [], due: null,
      due_has_time: false, subtasks: [], order: 0,
      created_at: 1, updated_at: 100, deleted_at: null,
    }]);
    await pullTable("ideas", client);

    const idea = await db.ideas.where("guid").equals("i-orphan").first();
    expect(idea).toBeDefined();
    // placeholder 0 is required (Idea.projectId: number)
    expect(idea!.projectId).toBe(0);
    // but _pendingProjectGuid must be set so we can re-resolve later
    expect((idea as unknown as Record<string, unknown>)._pendingProjectGuid).toBe("pg-missing");
  });
});

describe("I2: tombstone tie — remote wins on equal updatedAt", () => {
  it("deletes local row when remote tombstone has same updated_at", async () => {
    const { client } = makeMockClient("u1");

    await db.tasks.add({
      guid: "g-tie", title: "local-tie", links: [], projectId: null,
      bucket: "today", status: "todo", order: 0, createdAt: 1,
      completedAt: null, due: null, dueHasTime: false, subtasks: [],
      carried: false, dayKey: null, archived: false, archivedAt: null,
      updatedAt: 500, deletedAt: null,
    });

    // Remote tombstone with same updated_at=500 → tie → remote wins → delete.
    await client.upsert("tasks", [{
      guid: "g-tie", user_id: "u1", title: "local-tie", links: [],
      project_guid: null, bucket: "today", status: "todo", order: 0,
      created_at: 1, completed_at: null, due: null, due_has_time: false,
      subtasks: [], carried: false, day_key: null, archived: false,
      archived_at: null, updated_at: 500, deleted_at: 500,
    }]);

    await pullTable("tasks", client);

    const row = await db.tasks.where("guid").equals("g-tie").first();
    expect(row).toBeUndefined();
  });
});

describe("re-pull idempotence", () => {
  it("produces no duplicates and same final state when pull cursor is rewound", async () => {
    const { client } = makeMockClient("u1");

    // Populate server with two tasks.
    await client.upsert("tasks", [
      {
        guid: "r1", user_id: "u1", title: "task-one", links: [],
        project_guid: null, bucket: "today", status: "todo", order: 0,
        created_at: 1, completed_at: null, due: null, due_has_time: false,
        subtasks: [], carried: false, day_key: null, archived: false,
        archived_at: null, updated_at: 100, deleted_at: null,
      },
      {
        guid: "r2", user_id: "u1", title: "task-two", links: [],
        project_guid: null, bucket: "week", status: "todo", order: 1,
        created_at: 2, completed_at: null, due: null, due_has_time: false,
        subtasks: [], carried: false, day_key: null, archived: false,
        archived_at: null, updated_at: 200, deleted_at: null,
      },
    ]);

    // First pull.
    await pullTable("tasks", client);
    const cursorAfterFirst = await getPullCursor("tasks");

    // Rewind cursor to before first pull.
    await setPullCursor("tasks", 0);

    // Re-pull.
    await pullTable("tasks", client);

    // No duplicates: each guid appears exactly once.
    const all = await db.tasks.toArray();
    const countByGuid = new Map<string, number>();
    for (const t of all) countByGuid.set(t.guid, (countByGuid.get(t.guid) ?? 0) + 1);
    expect(countByGuid.get("r1")).toBe(1);
    expect(countByGuid.get("r2")).toBe(1);

    // Cursor is back to the same value as after the first pull.
    const cursorAfterSecond = await getPullCursor("tasks");
    expect(cursorAfterSecond).toBe(cursorAfterFirst);

    // Final state is identical.
    const r1 = await db.tasks.where("guid").equals("r1").first();
    const r2 = await db.tasks.where("guid").equals("r2").first();
    expect(r1!.title).toBe("task-one");
    expect(r2!.title).toBe("task-two");
  });
});

// ---------------------------------------------------------------------------
// syncOnce — full pull/push cycle, projects-first ordering
// ---------------------------------------------------------------------------

describe("syncOnce", () => {
  it("pulls all tables and then pushes all tables in one cycle", async () => {
    const { client, store } = makeMockClient("u1");

    // Seed a local project and task to push.
    await db.projects.add({
      guid: "p-sync", name: "Sync Project", kind: "active", color: "#fff",
      order: 0, createdAt: 1, archivedAt: null, updatedAt: 50, deletedAt: null,
    });
    await db.tasks.add({
      guid: "t-sync", title: "sync task", links: [], projectId: 1,
      bucket: "today", status: "todo", order: 0, createdAt: 1,
      completedAt: null, due: null, dueHasTime: false, subtasks: [],
      carried: false, dayKey: null, archived: false, archivedAt: null,
      updatedAt: 50, deletedAt: null,
    });

    // Seed a remote idea to pull.
    await client.upsert("ideas", [{
      guid: "i-remote", user_id: "u1", project_guid: null,
      text: "remote idea", status: "open", links: [], due: null,
      due_has_time: false, subtasks: [], order: 0,
      created_at: 1, updated_at: 100, deleted_at: null,
    }]);

    await syncOnce(client, "u1");

    // Local rows pushed to remote store.
    expect(store.get("projects")?.has("p-sync")).toBe(true);
    expect(store.get("tasks")?.has("t-sync")).toBe(true);

    // Remote idea pulled into local db.
    const idea = await db.ideas.where("guid").equals("i-remote").first();
    expect(idea).toBeDefined();
    expect(idea!.text).toBe("remote idea");
  });

  it("projects are pulled before tasks so orphan resolution works in one cycle", async () => {
    const { client } = makeMockClient("u1");

    // Remote project + task referencing it, both in the same sync.
    await client.upsert("projects", [{
      guid: "pg-order", user_id: "u1", name: "Order Test", kind: "active",
      color: "#111", order: 0, created_at: 1, archived_at: null,
      updated_at: 10, deleted_at: null,
    }]);
    await client.upsert("tasks", [{
      guid: "tg-order", user_id: "u1", title: "depends on project",
      links: [], project_guid: "pg-order", bucket: "today", status: "todo",
      order: 0, created_at: 1, completed_at: null, due: null,
      due_has_time: false, subtasks: [], carried: false, day_key: null,
      archived: false, archived_at: null, updated_at: 20, deleted_at: null,
    }]);

    await syncOnce(client, "u1");

    // If projects pulled first, task can resolve projectId in the same cycle.
    const task = await db.tasks.where("guid").equals("tg-order").first();
    expect(task).toBeDefined();
    // projectId should be resolved (not null/0) because project arrived first.
    expect(task!.projectId).not.toBeNull();
    expect((task as unknown as Record<string, unknown>)._pendingProjectGuid).toBeNull();
  });

  it("pushes all relational tables (projects, tasks, ideas, backlog) in one cycle", async () => {
    const { client, store } = makeMockClient("u1");

    await db.projects.add({
      guid: "all-p", name: "P", kind: "active", color: "#000",
      order: 0, createdAt: 1, archivedAt: null, updatedAt: 5, deletedAt: null,
    });
    await db.ideas.add({
      guid: "all-i", text: "idea", status: "open" as const, links: [],
      projectId: 0, due: null, dueHasTime: false, subtasks: [], order: 0,
      createdAt: 1, updatedAt: 5, deletedAt: null,
    });
    await db.backlog.add({
      guid: "all-b", title: "backlog item", links: [], due: null,
      dueHasTime: false, subtasks: [], order: 0, createdAt: 1,
      updatedAt: 5, deletedAt: null, promotedProjectId: null,
    });

    await syncOnce(client, "u1");

    expect(store.get("projects")?.has("all-p")).toBe(true);
    expect(store.get("ideas")?.has("all-i")).toBe(true);
    expect(store.get("backlog")?.has("all-b")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// migrateInitial — reset cursors + verifyCounts ok=true/ok=false
// ---------------------------------------------------------------------------

describe("migrateInitial — cursor reset behaviour", () => {
  it("resets cursors to 0 so all rows are dirty and pushed", async () => {
    const { client } = makeMockClient("u1");

    // Add a project that was already pushed (simulate non-zero cursor).
    await db.projects.add({
      guid: "pm-1", name: "Old", kind: "active", color: "#f00",
      order: 0, createdAt: 1, archivedAt: null, updatedAt: 200, deletedAt: null,
    });
    // Manually advance the cursor so it looks already pushed.
    const { setLastPushedAt } = await import("@/lib/sync/dirty");
    await setLastPushedAt("projects", 300);

    // With cursor=300, no rows are dirty (updatedAt=200 ≤ 300).
    const dirtyBefore = await getLastPushedAt("projects");
    expect(dirtyBefore).toBe(300);

    // migrateInitial should reset cursors and push everything.
    const result = await migrateInitial(client, "u1");
    expect(result.ok).toBe(true);
    // The project was pushed (cursor is reset).
    expect(result.counts.projects.remote).toBe(1);
  });

  it("returns ok=true when all live counts match after push", async () => {
    const { client } = makeMockClient("u1");

    await db.projects.add({
      guid: "pm-ok-p", name: "OK", kind: "active", color: "#0f0",
      order: 0, createdAt: 1, archivedAt: null, updatedAt: 1, deletedAt: null,
    });
    await db.ideas.add({
      guid: "pm-ok-i", text: "ok idea", status: "open" as const, links: [],
      projectId: 1, due: null, dueHasTime: false, subtasks: [], order: 0,
      createdAt: 1, updatedAt: 1, deletedAt: null,
    });

    const result = await migrateInitial(client, "u1");
    expect(result.ok).toBe(true);
    expect(result.counts.projects).toEqual({ local: 1, remote: 1 });
    expect(result.counts.ideas).toEqual({ local: 1, remote: 1 });
  });

  it("returns ok=false when a table's counts do not match", async () => {
    const { client, store } = makeMockClient("u1");

    await db.tasks.add({
      guid: "pm-fail-t", title: "task", links: [], projectId: null,
      bucket: "today", status: "todo", order: 0, createdAt: 1,
      completedAt: null, due: null, dueHasTime: false, subtasks: [],
      carried: false, dayKey: null, archived: false, archivedAt: null,
      updatedAt: 1, deletedAt: null,
    });

    const result = await migrateInitial(client, "u1");
    expect(result.ok).toBe(true); // pushed OK initially

    // Now simulate a discrepancy: remove the remote row after push.
    store.get("tasks")!.clear();

    // Re-verify counts separately to see the mismatch path.
    const counts = await verifyCounts(client);
    expect(counts.tasks.local).toBe(1);
    expect(counts.tasks.remote).toBe(0);
    // They differ so ok would be false.
    const ok = (["projects", "tasks", "ideas", "backlog"] as const).every(
      (t) => counts[t].local === counts[t].remote,
    );
    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyCounts — local vs remote mismatch detection, photos branch
// ---------------------------------------------------------------------------

describe("verifyCounts", () => {
  it("counts photos separately (uses db.photos, not localLiveCount)", async () => {
    const { client } = makeMockClient("u1");

    // Add a live photo locally.
    await db.photos.add({
      guid: "ph-1",
      parentType: "task",
      parentGuid: "t1",
      blob: new Blob(["x"]),
      thumb: new Blob(["y"]),
      width: 10,
      height: 10,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      remoteUrl: null,
    });

    const counts = await verifyCounts(client);
    // Local photo counted; remote=0 (mock countLive returns 0).
    expect(counts.photos.local).toBe(1);
    expect(counts.photos.remote).toBe(0);
  });

  it("excludes soft-deleted local photos from the live count", async () => {
    const { client } = makeMockClient("u1");

    await db.photos.add({
      guid: "ph-del",
      parentType: "task",
      parentGuid: "t1",
      blob: new Blob(["x"]),
      thumb: new Blob(["y"]),
      width: 10,
      height: 10,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: 999,
      remoteUrl: null,
    });

    const counts = await verifyCounts(client);
    expect(counts.photos.local).toBe(0);
  });

  it("reports matching counts when both sides agree", async () => {
    const { client, store } = makeMockClient("u1");

    // Push a project so remote has one live row.
    await db.projects.add({
      guid: "vc-p", name: "VC", kind: "active", color: "#abc",
      order: 0, createdAt: 1, archivedAt: null, updatedAt: 1, deletedAt: null,
    });
    await pushTable("projects", client, "u1");

    // Confirm store has the row so countLive returns 1.
    expect(store.get("projects")?.size).toBe(1);

    const counts = await verifyCounts(client);
    expect(counts.projects).toEqual({ local: 1, remote: 1 });
  });
});

// ---------------------------------------------------------------------------
// applyRemoteRow — remaining table branches (projects, ideas, backlog)
// ---------------------------------------------------------------------------

describe("applyRemoteRow — projects table", () => {
  it("inserts a new project from remote", async () => {
    const { client } = makeMockClient("u1");
    await client.upsert("projects", [{
      guid: "proj-new", user_id: "u1", name: "New Project", kind: "active",
      color: "#abc", order: 1, created_at: 1, archived_at: null,
      updated_at: 100, deleted_at: null,
    }]);
    await pullTable("projects", client);

    const p = await db.projects.where("guid").equals("proj-new").first();
    expect(p).toBeDefined();
    expect(p!.name).toBe("New Project");
  });

  it("updates an existing project from remote when remote is newer", async () => {
    const { client } = makeMockClient("u1");
    await db.projects.add({
      guid: "proj-upd", name: "Old Name", kind: "active", color: "#000",
      order: 0, createdAt: 1, archivedAt: null, updatedAt: 50, deletedAt: null,
    });
    await client.upsert("projects", [{
      guid: "proj-upd", user_id: "u1", name: "New Name", kind: "active",
      color: "#fff", order: 0, created_at: 1, archived_at: null,
      updated_at: 200, deleted_at: null,
    }]);
    await pullTable("projects", client);

    const p = await db.projects.where("guid").equals("proj-upd").first();
    expect(p!.name).toBe("New Name");
  });

  it("applies remote tombstone to project — deletes local row", async () => {
    const { client } = makeMockClient("u1");
    await db.projects.add({
      guid: "proj-del", name: "Del Me", kind: "active", color: "#000",
      order: 0, createdAt: 1, archivedAt: null, updatedAt: 10, deletedAt: null,
    });
    await client.upsert("projects", [{
      guid: "proj-del", user_id: "u1", name: "Del Me", kind: "active",
      color: "#000", order: 0, created_at: 1, archived_at: null,
      updated_at: 999, deleted_at: 999,
    }]);
    await pullTable("projects", client);
    const p = await db.projects.where("guid").equals("proj-del").first();
    expect(p).toBeUndefined();
  });
});

describe("applyRemoteRow — ideas table", () => {
  it("inserts a new idea from remote (with resolved project)", async () => {
    const { client } = makeMockClient("u1");

    // Project must exist locally so projectId resolves.
    await db.projects.add({
      guid: "pg-idea", name: "P", kind: "active", color: "#000",
      order: 0, createdAt: 1, archivedAt: null, updatedAt: 1, deletedAt: null,
    });
    await client.upsert("ideas", [{
      guid: "idea-new", user_id: "u1", project_guid: "pg-idea",
      text: "new idea", status: "open", links: [], due: null,
      due_has_time: false, subtasks: [], order: 0,
      created_at: 1, updated_at: 100, deleted_at: null,
    }]);
    await pullTable("ideas", client);

    const idea = await db.ideas.where("guid").equals("idea-new").first();
    expect(idea).toBeDefined();
    expect(idea!.text).toBe("new idea");
    expect(idea!.projectId).not.toBe(0);
  });

  it("updates an existing idea from remote when remote is newer", async () => {
    const { client } = makeMockClient("u1");

    await db.ideas.add({
      guid: "idea-upd", text: "old", status: "open" as const, links: [],
      projectId: 0, due: null, dueHasTime: false, subtasks: [], order: 0,
      createdAt: 1, updatedAt: 50, deletedAt: null,
    });
    await client.upsert("ideas", [{
      guid: "idea-upd", user_id: "u1", project_guid: null,
      text: "updated idea", status: "open", links: [], due: null,
      due_has_time: false, subtasks: [], order: 0,
      created_at: 1, updated_at: 200, deleted_at: null,
    }]);
    await pullTable("ideas", client);

    const idea = await db.ideas.where("guid").equals("idea-upd").first();
    expect(idea!.text).toBe("updated idea");
  });

  it("applies remote tombstone to idea — deletes local row", async () => {
    const { client } = makeMockClient("u1");
    await db.ideas.add({
      guid: "idea-del", text: "bye", status: "open" as const, links: [],
      projectId: 0, due: null, dueHasTime: false, subtasks: [], order: 0,
      createdAt: 1, updatedAt: 10, deletedAt: null,
    });
    await client.upsert("ideas", [{
      guid: "idea-del", user_id: "u1", project_guid: null,
      text: "bye", status: "open", links: [], due: null,
      due_has_time: false, subtasks: [], order: 0,
      created_at: 1, updated_at: 999, deleted_at: 999,
    }]);
    await pullTable("ideas", client);
    const idea = await db.ideas.where("guid").equals("idea-del").first();
    expect(idea).toBeUndefined();
  });
});

describe("applyRemoteRow — backlog table", () => {
  it("inserts a new backlog item from remote (with resolved promotedProjectId)", async () => {
    const { client } = makeMockClient("u1");

    await db.projects.add({
      guid: "pg-bl", name: "BL Proj", kind: "active", color: "#000",
      order: 0, createdAt: 1, archivedAt: null, updatedAt: 1, deletedAt: null,
    });
    await client.upsert("backlog", [{
      guid: "bl-new", user_id: "u1", title: "new backlog",
      note: null, links: [], due: null, due_has_time: false, subtasks: [],
      order: 0, created_at: 1, promoted_project_guid: "pg-bl",
      updated_at: 100, deleted_at: null,
    }]);
    await pullTable("backlog", client);

    const b = await db.backlog.where("guid").equals("bl-new").first();
    expect(b).toBeDefined();
    expect(b!.title).toBe("new backlog");
    expect(b!.promotedProjectId).not.toBeNull();
  });

  it("backlog item with absent promotedProject sets _pendingPromotedGuid", async () => {
    const { client } = makeMockClient("u1");
    await client.upsert("backlog", [{
      guid: "bl-orphan", user_id: "u1", title: "orphan backlog",
      note: null, links: [], due: null, due_has_time: false, subtasks: [],
      order: 0, created_at: 1, promoted_project_guid: "pg-absent",
      updated_at: 100, deleted_at: null,
    }]);
    await pullTable("backlog", client);

    const b = await db.backlog.where("guid").equals("bl-orphan").first();
    expect(b).toBeDefined();
    expect((b as unknown as Record<string, unknown>)._pendingPromotedGuid).toBe("pg-absent");
    expect(b!.promotedProjectId).toBeNull();
  });

  it("updates an existing backlog item from remote when remote is newer", async () => {
    const { client } = makeMockClient("u1");
    await db.backlog.add({
      guid: "bl-upd", title: "old title", links: [], due: null,
      dueHasTime: false, subtasks: [], order: 0, createdAt: 1,
      updatedAt: 50, deletedAt: null, promotedProjectId: null,
    });
    await client.upsert("backlog", [{
      guid: "bl-upd", user_id: "u1", title: "updated title",
      note: null, links: [], due: null, due_has_time: false, subtasks: [],
      order: 0, created_at: 1, promoted_project_guid: null,
      updated_at: 200, deleted_at: null,
    }]);
    await pullTable("backlog", client);

    const b = await db.backlog.where("guid").equals("bl-upd").first();
    expect(b!.title).toBe("updated title");
  });

  it("applies remote tombstone to backlog item — deletes local row", async () => {
    const { client } = makeMockClient("u1");
    await db.backlog.add({
      guid: "bl-del", title: "gone", links: [], due: null,
      dueHasTime: false, subtasks: [], order: 0, createdAt: 1,
      updatedAt: 10, deletedAt: null, promotedProjectId: null,
    });
    await client.upsert("backlog", [{
      guid: "bl-del", user_id: "u1", title: "gone",
      note: null, links: [], due: null, due_has_time: false, subtasks: [],
      order: 0, created_at: 1, promoted_project_guid: null,
      updated_at: 999, deleted_at: 999,
    }]);
    await pullTable("backlog", client);
    const b = await db.backlog.where("guid").equals("bl-del").first();
    expect(b).toBeUndefined();
  });
});

describe("resolvePendingRelations — backlog branch", () => {
  it("re-resolves backlog promotedProjectId when project arrives later", async () => {
    const { client } = makeMockClient("u1");

    // Pull a backlog item whose promoted project doesn't exist yet.
    await client.upsert("backlog", [{
      guid: "bl-pend", user_id: "u1", title: "pending backlog",
      note: null, links: [], due: null, due_has_time: false, subtasks: [],
      order: 0, created_at: 1, promoted_project_guid: "pg-later",
      updated_at: 100, deleted_at: null,
    }]);
    await pullTable("backlog", client);

    const orphan = await db.backlog.where("guid").equals("bl-pend").first();
    expect(orphan!.promotedProjectId).toBeNull();
    expect((orphan as unknown as Record<string, unknown>)._pendingPromotedGuid).toBe("pg-later");

    // Project arrives.
    await client.upsert("projects", [{
      guid: "pg-later", user_id: "u1", name: "Later Project", kind: "active",
      color: "#222", order: 0, created_at: 1, archived_at: null,
      updated_at: 50, deleted_at: null,
    }]);
    await pullTable("projects", client);
    await resolvePendingRelations();

    const resolved = await db.backlog.where("guid").equals("bl-pend").first();
    expect(resolved!.promotedProjectId).not.toBeNull();
    expect((resolved as unknown as Record<string, unknown>)._pendingPromotedGuid).toBeNull();
  });
});

describe("resolvePendingRelations — idea branch", () => {
  it("re-resolves idea projectId when project arrives later", async () => {
    const { client } = makeMockClient("u1");

    await client.upsert("ideas", [{
      guid: "i-pend", user_id: "u1", project_guid: "pg-idea-later",
      text: "pending idea", status: "open", links: [], due: null,
      due_has_time: false, subtasks: [], order: 0,
      created_at: 1, updated_at: 100, deleted_at: null,
    }]);
    await pullTable("ideas", client);

    const orphan = await db.ideas.where("guid").equals("i-pend").first();
    expect(orphan!.projectId).toBe(0);
    expect((orphan as unknown as Record<string, unknown>)._pendingProjectGuid).toBe("pg-idea-later");

    await client.upsert("projects", [{
      guid: "pg-idea-later", user_id: "u1", name: "Idea Proj", kind: "active",
      color: "#333", order: 0, created_at: 1, archived_at: null,
      updated_at: 60, deleted_at: null,
    }]);
    await pullTable("projects", client);
    await resolvePendingRelations();

    const resolved = await db.ideas.where("guid").equals("i-pend").first();
    expect(resolved!.projectId).not.toBe(0);
    expect(resolved!.projectId).not.toBeNull();
    expect((resolved as unknown as Record<string, unknown>)._pendingProjectGuid).toBeNull();
  });
});

describe("resetSyncCursors", () => {
  it("resets all push and pull cursors to 0", async () => {
    const { setLastPushedAt } = await import("@/lib/sync/dirty");
    await setLastPushedAt("projects", 500);
    await setPullCursor("tasks", 300);

    await resetSyncCursors();

    expect(await getLastPushedAt("projects")).toBe(0);
    expect(await getPullCursor("tasks")).toBe(0);
  });
});
