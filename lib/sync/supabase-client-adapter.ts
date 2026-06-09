import type { SupabaseClient } from "@supabase/supabase-js";
import type { RemoteRow, SyncClient, Table } from "@/lib/sync/types";

// PostgREST default row limit is 1 000. We page with the same size so a
// large initial migration never silently truncates.  The secondary sort on
// guid makes tie-breaks on updated_at deterministic so rows are never
// duplicated or skipped across page boundaries.
const PULL_PAGE_SIZE = 1000;

export function createSupabaseSyncClient(sb: SupabaseClient): SyncClient {
  return {
    async getUserId() {
      const { data } = await sb.auth.getUser();
      return data.user?.id ?? null;
    },

    async upsert(table: Table, rows: RemoteRow[]) {
      if (rows.length === 0) return { accepted: [] };
      const { data, error } = await sb.rpc("upsert_lww", {
        p_table: table,
        p_rows: rows,
      });
      if (error) throw error;
      // RPC returns only the guids that passed the LWW where-clause.
      const accepted = Array.isArray(data) ? (data as string[]) : [];
      return { accepted };
    },

    async pullSince(table: Table, cursor: number) {
      // Paginate to avoid silent truncation at PostgREST's 1 000-row default.
      // Sort by (server_updated_at ASC, guid ASC): server_updated_at is the
      // server-stamped receive-time, so the cursor correctly tracks when the
      // server received each row — not when the client last edited it.
      // Tie-breaks on guid keep page boundaries stable (no duplicate/skip).
      const rows: RemoteRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await sb
          .from(table)
          .select("*")
          .gt("server_updated_at", cursor)
          .order("server_updated_at", { ascending: true })
          .order("guid", { ascending: true })
          .range(from, from + PULL_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data ?? []) as RemoteRow[];
        rows.push(...page);
        if (page.length < PULL_PAGE_SIZE) break;
        from += PULL_PAGE_SIZE;
      }
      return rows;
    },

    async countLive(table: Table) {
      const { count, error } = await sb
        .from(table)
        .select("guid", { count: "exact", head: true })
        .is("deleted_at", null);
      if (error) throw error;
      return count ?? 0;
    },

    async uploadPhoto(path: string, blob: Blob) {
      // iOS Safari uploads a 0-byte object when supabase-js wraps a Blob in a
      // multipart FormData body (its default path for Blob inputs). Sending the
      // raw ArrayBuffer takes the non-FormData branch, which Safari uploads
      // correctly. contentType must come from the blob itself — iOS falls back
      // to JPEG (canvas can't encode WebP there), so a hardcoded "image/webp"
      // would mislabel those bytes and break decoding on the receiving device.
      const buffer = await blob.arrayBuffer();
      const { error } = await sb.storage.from("photos").upload(path, buffer, {
        contentType: blob.type || "image/webp",
        upsert: true,
      });
      if (error) throw error;
    },

    async createSignedUrl(path: string, expiresInSec: number) {
      const { data, error } = await sb.storage
        .from("photos")
        .createSignedUrl(path, expiresInSec);
      if (error) throw error;
      return data.signedUrl;
    },
  };
}
