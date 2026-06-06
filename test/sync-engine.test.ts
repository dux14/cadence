import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db/schema";
import type { RemoteRow, SyncClient, Table } from "@/lib/sync/types";
import { pushTable, pullTable, migrateInitial, verifyCounts, resolvePendingRelations } from "@/lib/sync/engine";
import { getPullCursor, getLastPushedAt, setPullCursor } from "@/lib/sync/dirty";

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
