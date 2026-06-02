export type ProjectKind = "active" | "area";
export type Bucket = "today" | "tomorrow" | "week";
export type TaskStatus = "open" | "done";
export type IdeaStatus = "open" | "promoted";

export interface Project {
  id?: number;
  name: string;
  kind: ProjectKind;
  color: string;
  order: number;
  createdAt: number;
  archivedAt?: number | null;
}

export interface Task {
  id?: number;
  title: string;
  links: string[];
  projectId?: number | null;
  bucket: Bucket;
  status: TaskStatus;
  order: number;
  createdAt: number;
  completedAt?: number | null;
  /** Rolled over from a previous day while still open. */
  carried?: boolean;
  /** Date the task was placed into Today, e.g. "2026-06-02". */
  dayKey?: string | null;
  /** Archived done tasks live on for the History view. */
  archived?: boolean;
  archivedAt?: number | null;
}

export interface Idea {
  id?: number;
  projectId: number;
  text: string;
  status: IdeaStatus;
  order: number;
  createdAt: number;
}

export interface BacklogItem {
  id?: number;
  title: string;
  note?: string;
  order: number;
  createdAt: number;
  promotedProjectId?: number | null;
}

export const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This Week" },
];
