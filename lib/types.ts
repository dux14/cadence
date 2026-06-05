export type ProjectKind = "active" | "area";
export type Bucket = "today" | "tomorrow" | "week";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type IdeaStatus = "open" | "promoted";

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

export interface Project {
  id?: number;
  guid: string;
  name: string;
  kind: ProjectKind;
  color: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
  deletedAt?: number | null;
}

export interface Task {
  id?: number;
  guid: string;
  /** May contain "\n" — multiline title; preview clamps to ~2 lines. */
  title: string;
  links: string[];
  subtasks: Subtask[];
  projectId?: number | null;
  bucket: Bucket;
  status: TaskStatus;
  order: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number | null;
  /** Unified due timestamp (ms). dueHasTime distinguishes date-only. */
  due?: number | null;
  dueHasTime?: boolean;
  /** Rolled over from a previous day while still not done. */
  carried?: boolean;
  /** Date the task was placed into Today, e.g. "2026-06-02". */
  dayKey?: string | null;
  /** Archived done tasks live on for the History view. */
  archived?: boolean;
  archivedAt?: number | null;
  /** Tombstone: soft-deleted rows keep their id for sync. */
  deletedAt?: number | null;
}

export interface Idea {
  id?: number;
  guid: string;
  projectId: number;
  /** May contain "\n". */
  text: string;
  links: string[];
  subtasks: Subtask[];
  status: IdeaStatus;
  order: number;
  createdAt: number;
  updatedAt: number;
  due?: number | null;
  dueHasTime?: boolean;
  deletedAt?: number | null;
}

export interface BacklogItem {
  id?: number;
  guid: string;
  title: string;
  note?: string;
  links: string[];
  subtasks: Subtask[];
  order: number;
  createdAt: number;
  updatedAt: number;
  due?: number | null;
  dueHasTime?: boolean;
  promotedProjectId?: number | null;
  deletedAt?: number | null;
}

export const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This Week" },
];
