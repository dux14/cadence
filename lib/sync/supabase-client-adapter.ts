import type { SupabaseClient } from "@supabase/supabase-js";
import type { RemoteRow, SyncClient, Table } from "@/lib/sync/types";

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
      // RPC returns the set of guids it processed.
      const accepted = Array.isArray(data) ? (data as string[]) : [];
      return { accepted };
    },

    async pullSince(table: Table, cursor: number) {
      const { data, error } = await sb
        .from(table)
        .select("*")
        .gt("updated_at", cursor)
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RemoteRow[];
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
      const { error } = await sb.storage
        .from("photos")
        .upload(path, blob, { contentType: "image/webp", upsert: true });
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
