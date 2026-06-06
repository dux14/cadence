import type {
  Project,
  Task,
  Idea,
  BacklogItem,
  Photo,
} from "@/lib/types";
import type { RemoteRow } from "@/lib/sync/types";

// ---- projects ----
export function projectToRemote(p: Project, userId: string): RemoteRow {
  return {
    guid: p.guid,
    user_id: userId,
    name: p.name,
    kind: p.kind,
    color: p.color,
    order: p.order,
    created_at: p.createdAt,
    archived_at: p.archivedAt ?? null,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt ?? null,
  };
}
export function projectFromRemote(r: RemoteRow): Omit<Project, "id"> {
  return {
    guid: r.guid as string,
    name: r.name as string,
    kind: r.kind as Project["kind"],
    color: r.color as string,
    order: r.order as number,
    createdAt: r.created_at as number,
    archivedAt: (r.archived_at as number | null) ?? null,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
  };
}

// ---- tasks ----
export function taskToRemote(
  t: Task,
  userId: string,
  projectGuid: string | null,
): RemoteRow {
  return {
    guid: t.guid,
    user_id: userId,
    title: t.title,
    links: t.links,
    project_guid: projectGuid,
    bucket: t.bucket,
    status: t.status,
    order: t.order,
    created_at: t.createdAt,
    completed_at: t.completedAt ?? null,
    due: t.due ?? null,
    due_has_time: t.dueHasTime ?? false,
    subtasks: t.subtasks,
    carried: t.carried ?? false,
    day_key: t.dayKey ?? null,
    archived: t.archived ?? false,
    archived_at: t.archivedAt ?? null,
    updated_at: t.updatedAt,
    deleted_at: t.deletedAt ?? null,
  };
}
/** projectId is resolved by the caller (guid→local id lookup); not here. */
export function taskFromRemote(r: RemoteRow): Omit<Task, "id" | "projectId"> {
  return {
    guid: r.guid as string,
    title: r.title as string,
    links: (r.links as string[]) ?? [],
    bucket: r.bucket as Task["bucket"],
    status: r.status as Task["status"],
    order: r.order as number,
    createdAt: r.created_at as number,
    completedAt: (r.completed_at as number | null) ?? null,
    due: (r.due as number | null) ?? null,
    dueHasTime: Boolean(r.due_has_time),
    subtasks: (r.subtasks as Task["subtasks"]) ?? [],
    carried: Boolean(r.carried),
    dayKey: (r.day_key as string | null) ?? null,
    archived: Boolean(r.archived),
    archivedAt: (r.archived_at as number | null) ?? null,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
  };
}
/** project_guid travels with the remote row; caller resolves to local id. */
export function taskRemoteProjectGuid(r: RemoteRow): string | null {
  return (r.project_guid as string | null) ?? null;
}

// ---- ideas ----
export function ideaToRemote(
  i: Idea,
  userId: string,
  projectGuid: string | null,
): RemoteRow {
  return {
    guid: i.guid,
    user_id: userId,
    project_guid: projectGuid,
    text: i.text,
    status: i.status,
    links: i.links ?? [],
    due: i.due ?? null,
    due_has_time: i.dueHasTime ?? false,
    subtasks: i.subtasks ?? [],
    order: i.order,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
    deleted_at: i.deletedAt ?? null,
  };
}
export function ideaFromRemote(r: RemoteRow): Omit<Idea, "id" | "projectId"> {
  return {
    guid: r.guid as string,
    text: r.text as string,
    status: r.status as Idea["status"],
    links: (r.links as string[]) ?? [],
    due: (r.due as number | null) ?? null,
    dueHasTime: Boolean(r.due_has_time),
    subtasks: (r.subtasks as Idea["subtasks"]) ?? [],
    order: r.order as number,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
  };
}
export function ideaRemoteProjectGuid(r: RemoteRow): string | null {
  return (r.project_guid as string | null) ?? null;
}

// ---- backlog ----
export function backlogToRemote(
  b: BacklogItem,
  userId: string,
  promotedProjectGuid: string | null,
): RemoteRow {
  return {
    guid: b.guid,
    user_id: userId,
    title: b.title,
    note: b.note ?? null,
    links: b.links ?? [],
    due: b.due ?? null,
    due_has_time: b.dueHasTime ?? false,
    subtasks: b.subtasks ?? [],
    order: b.order,
    created_at: b.createdAt,
    promoted_project_guid: promotedProjectGuid,
    updated_at: b.updatedAt,
    deleted_at: b.deletedAt ?? null,
  };
}
export function backlogFromRemote(
  r: RemoteRow,
): Omit<BacklogItem, "id" | "promotedProjectId"> {
  return {
    guid: r.guid as string,
    title: r.title as string,
    note: (r.note as string | undefined) ?? undefined,
    links: (r.links as string[]) ?? [],
    due: (r.due as number | null) ?? null,
    dueHasTime: Boolean(r.due_has_time),
    subtasks: (r.subtasks as BacklogItem["subtasks"]) ?? [],
    order: r.order as number,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
  };
}
export function backlogRemotePromotedGuid(r: RemoteRow): string | null {
  return (r.promoted_project_guid as string | null) ?? null;
}

// ---- photos (metadata only) ----
export function photoToRemote(
  p: Photo,
  userId: string,
  storagePath: string | null,
): RemoteRow {
  return {
    guid: p.guid,
    user_id: userId,
    parent_type: p.parentType,
    parent_guid: p.parentGuid,
    width: p.width,
    height: p.height,
    storage_path: storagePath,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt ?? null,
  };
}
/** No blob/thumb on the remote row; downloaded on demand via signed URL. */
export function photoFromRemote(
  r: RemoteRow,
): Omit<Photo, "id" | "blob" | "thumb"> {
  return {
    guid: r.guid as string,
    parentType: r.parent_type as Photo["parentType"],
    parentGuid: r.parent_guid as string,
    width: r.width as number,
    height: r.height as number,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    remoteUrl: (r.storage_path as string | null) ?? null,
  };
}
export function photoRemoteStoragePath(r: RemoteRow): string | null {
  return (r.storage_path as string | null) ?? null;
}
