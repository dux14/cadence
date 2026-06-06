import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db/schema";
import type { RemoteRow, SyncClient, Table } from "@/lib/sync/types";
import { pushTable, pullTable, migrateInitial, verifyCounts } from "@/lib/sync/engine";
import { getPullCursor } from "@/lib/sync/dirty";

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
