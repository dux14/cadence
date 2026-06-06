// Snake_case row shapes as stored in Postgres. The engine speaks these;
// mappers translate to/from the camelCase Dexie entities.
export type Table = "projects" | "tasks" | "ideas" | "backlog" | "photos";

export interface RemoteRowBase {
  guid: string;
  user_id: string;
  updated_at: number;
  deleted_at: number | null;
}
// Engine treats remote rows generically; mappers know the concrete columns.
export type RemoteRow = RemoteRowBase & Record<string, unknown>;

export interface UpsertResult {
  /** guids the server accepted (passed the LWW where-clause). */
  accepted: string[];
}

/**
 * Minimal surface the sync engine needs. Implemented for real by
 * supabase-client-adapter.ts and mocked in tests. Keeps the engine pure.
 */
export interface SyncClient {
  getUserId(): Promise<string | null>;
  /** LWW upsert: server keeps the row only if incoming updated_at >= current. */
  upsert(table: Table, rows: RemoteRow[]): Promise<UpsertResult>;
  /** Rows for this user with updated_at > cursor, ascending. */
  pullSince(table: Table, cursor: number): Promise<RemoteRow[]>;
  /** Count of non-deleted rows for this user (migration verification). */
  countLive(table: Table): Promise<number>;
  uploadPhoto(path: string, blob: Blob): Promise<void>;
  createSignedUrl(path: string, expiresInSec: number): Promise<string>;
}

export type SyncState = "synced" | "pending" | "offline";

export const SYNC_TABLES: Table[] = [
  "projects",
  "tasks",
  "ideas",
  "backlog",
  "photos",
];
