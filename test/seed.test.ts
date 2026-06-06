import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import Dexie from "dexie";
import { db, getMeta } from "@/lib/db/schema";
import { seedIfEmpty } from "@/lib/db/seed";

vi.mock("@/lib/sync/orchestrator", () => ({ scheduleSync: () => {} }));

beforeEach(async () => {
  db.close();
  await Dexie.delete("cadence");
  await db.open();
});

describe("seedIfEmpty", () => {
  it("populates projects, tasks, ideas and backlog when DB is empty", async () => {
    await seedIfEmpty();
    expect(await db.projects.count()).toBeGreaterThan(0);
    expect(await db.tasks.count()).toBeGreaterThan(0);
    expect(await db.ideas.count()).toBeGreaterThan(0);
    expect(await db.backlog.count()).toBeGreaterThan(0);
  });

  it("sets the seeded meta flag and lastOpenedDay after seeding", async () => {
    await seedIfEmpty();
    expect(await getMeta("seeded", false)).toBe(true);
    const lastOpened = await getMeta<string | null>("lastOpenedDay", null);
    expect(lastOpened).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is idempotent: calling twice does not duplicate data", async () => {
    await seedIfEmpty();
    const count1 = await db.projects.count();
    await seedIfEmpty();
    const count2 = await db.projects.count();
    expect(count2).toBe(count1);
  });

  it("does not seed when the seeded flag is already set", async () => {
    // Manually set the flag without seeding.
    await db.meta.put({ key: "seeded", value: true });
    await seedIfEmpty();
    // No projects should have been inserted.
    expect(await db.projects.count()).toBe(0);
  });

  it("does not seed when projects already exist (legacy guard)", async () => {
    // Manually insert a project to simulate pre-existing data.
    const now = Date.now();
    await db.projects.add({
      guid: "existing-guid",
      name: "Pre-existing",
      kind: "active",
      color: "#aabbcc",
      order: 1,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    });
    await seedIfEmpty();
    // Only the one manually inserted project should exist.
    expect(await db.projects.count()).toBe(1);
    // The seeded flag should have been set to true.
    expect(await getMeta("seeded", false)).toBe(true);
  });
});
