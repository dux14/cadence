import { describe, it, expect } from "vitest";
import {
  taskToRemote,
  taskFromRemote,
  projectToRemote,
  photoToRemote,
  ideaToRemote,
  ideaFromRemote,
  ideaRemoteProjectGuid,
  backlogToRemote,
  backlogFromRemote,
  backlogRemotePromotedGuid,
} from "@/lib/sync/mappers";
import type { Task, Idea, BacklogItem } from "@/lib/types";

const baseTask: Task = {
  id: 1,
  guid: "11111111-1111-4111-8111-111111111111",
  title: "Write plan",
  links: ["https://x.com"],
  projectId: null,
  bucket: "today",
  status: "todo",
  order: 3,
  createdAt: 1000,
  completedAt: null,
  due: 2000,
  dueHasTime: true,
  subtasks: [{ id: "s1", text: "draft", done: false }],
  carried: false,
  dayKey: "2026-06-05",
  archived: false,
  archivedAt: null,
  updatedAt: 5000,
  deletedAt: null,
};

describe("task mappers", () => {
  it("maps camelCase → snake_case with user_id and project_guid", () => {
    const r = taskToRemote(baseTask, "user-42", "proj-guid-9");
    expect(r).toMatchObject({
      guid: baseTask.guid,
      user_id: "user-42",
      project_guid: "proj-guid-9",
      due_has_time: true,
      day_key: "2026-06-05",
      updated_at: 5000,
      deleted_at: null,
    });
    expect(r.subtasks).toEqual(baseTask.subtasks);
    expect("projectId" in r).toBe(false);
    expect("id" in r).toBe(false);
  });

  it("round-trips snake_case → camelCase (id/projectId resolved by caller)", () => {
    const r = taskToRemote(baseTask, "user-42", "proj-guid-9");
    const back = taskFromRemote(r);
    expect(back.guid).toBe(baseTask.guid);
    expect(back.dueHasTime).toBe(true);
    expect(back.dayKey).toBe("2026-06-05");
    expect(back.subtasks).toEqual(baseTask.subtasks);
    // local-only fields are not present on the remote row
    expect(back).not.toHaveProperty("id");
    expect(back).not.toHaveProperty("projectId");
  });

  it("project maps order via quoted column key", () => {
    const r = projectToRemote(
      {
        id: 2,
        guid: "p-guid",
        name: "Cadence",
        kind: "active",
        color: "#A9C8EE",
        order: 7,
        createdAt: 1,
        archivedAt: null,
        updatedAt: 9,
        deletedAt: null,
      },
      "user-42",
    );
    expect(r.order).toBe(7);
    expect(r.user_id).toBe("user-42");
  });

  it("photo maps to metadata only — no blob/thumb", () => {
    const r = photoToRemote(
      {
        id: 5,
        guid: "ph-guid",
        parentType: "task",
        parentGuid: "t-guid",
        blob: new Blob(["x"]),
        thumb: new Blob(["y"]),
        width: 800,
        height: 600,
        createdAt: 1,
        updatedAt: 2,
        deletedAt: null,
        remoteUrl: null,
      },
      "user-42",
      "user-42/ph-guid.webp",
    );
    expect(r).toMatchObject({
      guid: "ph-guid",
      parent_type: "task",
      parent_guid: "t-guid",
      storage_path: "user-42/ph-guid.webp",
      width: 800,
    });
    expect("blob" in r).toBe(false);
    expect("thumb" in r).toBe(false);
  });
});

// ---- idea mappers ----

const baseIdea: Idea = {
  id: 10,
  guid: "22222222-2222-4222-8222-222222222222",
  projectId: 3,
  text: "Build something great",
  links: ["https://example.com"],
  subtasks: [{ id: "si1", text: "sketch it", done: false }],
  status: "open",
  order: 1,
  createdAt: 1100,
  updatedAt: 5500,
  due: 3000,
  dueHasTime: true,
  deletedAt: null,
};

describe("idea mappers", () => {
  it("round-trips ideaToRemote → ideaFromRemote: deletedAt, dueHasTime, and ideaRemoteProjectGuid", () => {
    const projectGuid = "proj-idea-guid-7";
    const r = ideaToRemote(baseIdea, "user-42", projectGuid);
    const back = ideaFromRemote(r);

    // deletedAt survives the round-trip
    expect(back.deletedAt).toBe(null);

    // dueHasTime: true survives
    expect(back.dueHasTime).toBe(true);

    // other core fields
    expect(back.guid).toBe(baseIdea.guid);
    expect(back.text).toBe(baseIdea.text);
    expect(back.links).toEqual(baseIdea.links);
    expect(back.subtasks).toEqual(baseIdea.subtasks);
    expect(back.updatedAt).toBe(baseIdea.updatedAt);

    // local-only fields not present
    expect(back).not.toHaveProperty("id");
    expect(back).not.toHaveProperty("projectId");

    // ideaRemoteProjectGuid returns the guid passed in
    expect(ideaRemoteProjectGuid(r)).toBe(projectGuid);
  });

  it("dueHasTime normalises to false when absent on remote row", () => {
    const r = ideaToRemote(
      { ...baseIdea, dueHasTime: undefined },
      "user-42",
      null,
    );
    // due_has_time is stored as false when undefined
    expect(r.due_has_time).toBe(false);
    const back = ideaFromRemote(r);
    expect(back.dueHasTime).toBe(false);
  });

  it("ideaRemoteProjectGuid returns null when no project guid", () => {
    const r = ideaToRemote(baseIdea, "user-42", null);
    expect(ideaRemoteProjectGuid(r)).toBe(null);
  });
});

// ---- backlog mappers ----

const baseBacklog: BacklogItem = {
  id: 20,
  guid: "33333333-3333-4333-8333-333333333333",
  title: "Refactor auth module",
  note: "See notion doc for context",
  links: ["https://notion.so/doc"],
  subtasks: [{ id: "bs1", text: "read doc", done: false }],
  order: 2,
  createdAt: 2000,
  updatedAt: 6000,
  due: 4000,
  dueHasTime: false,
  promotedProjectId: null,
  deletedAt: null,
};

describe("backlog mappers", () => {
  it("round-trip with note present: note survives as string", () => {
    const promotedGuid = "proj-backlog-guid-5";
    const r = backlogToRemote(baseBacklog, "user-42", promotedGuid);
    const back = backlogFromRemote(r);

    // note survives
    expect(back.note).toBe("See notion doc for context");

    // core fields
    expect(back.guid).toBe(baseBacklog.guid);
    expect(back.title).toBe(baseBacklog.title);
    expect(back.links).toEqual(baseBacklog.links);
    expect(back.subtasks).toEqual(baseBacklog.subtasks);
    expect(back.updatedAt).toBe(baseBacklog.updatedAt);
    expect(back.deletedAt).toBe(null);

    // local-only fields not present
    expect(back).not.toHaveProperty("id");
    expect(back).not.toHaveProperty("promotedProjectId");

    // backlogRemotePromotedGuid returns the guid passed in
    expect(backlogRemotePromotedGuid(r)).toBe(promotedGuid);
  });

  it("round-trip with note absent: result is undefined, NOT null", () => {
    const backlogNoNote: BacklogItem = { ...baseBacklog, note: undefined };
    const r = backlogToRemote(backlogNoNote, "user-42", null);

    // remote row stores null for missing note
    expect(r.note).toBe(null);

    const back = backlogFromRemote(r);

    // after round-trip, note must be undefined (not null)
    expect(back.note).toBeUndefined();
    expect(back.note).not.toBeNull();

    // backlogRemotePromotedGuid returns null when no promoted project
    expect(backlogRemotePromotedGuid(r)).toBe(null);
  });
});
