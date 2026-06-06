import { describe, it, expect } from "vitest";
import {
  taskToRemote,
  taskFromRemote,
  projectToRemote,
  photoToRemote,
} from "@/lib/sync/mappers";
import type { Task } from "@/lib/types";

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
