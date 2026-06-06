import { getSupabase } from "@/lib/supabase/client";
import { createSupabaseSyncClient } from "@/lib/sync/supabase-client-adapter";
import { syncOnce, migrateInitial } from "@/lib/sync/engine";
import {
  uploadPendingPhotos,
  pushPhotoMetadata,
  downloadPhotoBlob,
} from "@/lib/sync/photos";
import { getMeta, setMeta } from "@/lib/db/schema";
import { SYNC_TABLES } from "@/lib/sync/types";
import type { SyncState } from "@/lib/sync/types";

type Listener = (s: SyncState) => void;
const listeners = new Set<Listener>();
let current: SyncState = "offline";

function setState(s: SyncState) {
  current = s;
  for (const l of listeners) l(s);
}
export function onSyncState(cb: Listener): () => void {
  listeners.add(cb);
  cb(current);
  return () => listeners.delete(cb);
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/**
 * Single-writer push guarded by Web Locks so multiple tabs don't double-push.
 * Falls back to running directly if the API is unavailable.
 */
async function withPushLock(fn: () => Promise<void>): Promise<void> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return fn();
  await locks.request("cadence-sync-push", { mode: "exclusive" }, async () => {
    await fn();
  });
}

async function runSync(): Promise<void> {
  if (!navigator.onLine) {
    setState("offline");
    return;
  }
  const client = createSupabaseSyncClient(getSupabase());
  const userId = await client.getUserId();
  if (!userId) {
    setState("offline");
    return;
  }
  setState("pending");
  try {
    await withPushLock(async () => {
      await syncOnce(client, userId);
      await pushPhotoMetadata(client, userId);
      await uploadPendingPhotos(client, userId);
    });
    setState("synced");
  } catch {
    setState("pending");
  }
}

/** Call after every local write. Coalesces bursts into one push. */
export function scheduleSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void runSync(), 800);
}

/** First login: run the bulk migration once, then mark as migrated. */
export async function ensureMigrated(): Promise<void> {
  const done = await getMeta<boolean>("sync.migrated", false);
  if (done) return;
  if (!navigator.onLine) return; // retry next online tick
  const client = createSupabaseSyncClient(getSupabase());
  const userId = await client.getUserId();
  if (!userId) return;
  setState("pending");
  const result = await migrateInitial(client, userId);
  await pushPhotoMetadata(client, userId);
  await uploadPendingPhotos(client, userId);
  if (result.ok) {
    await setMeta("sync.migrated", true);
    setState("synced");
  } else {
    // Keep running locally; will retry on the next trigger.
    setState("pending");
  }
}

let realtimeChannel: ReturnType<ReturnType<typeof getSupabase>["channel"]> | null =
  null;

function startRealtime(): void {
  if (realtimeChannel) return;
  const sb = getSupabase();
  const ch = sb.channel("cadence-sync");
  for (const table of SYNC_TABLES) {
    // "postgres_changes" matches REALTIME_LISTEN_TYPES.POSTGRES_CHANGES;
    // event "*" matches REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.ALL.
    // Both are string-literal enum values — using them directly avoids
    // importing @supabase/realtime-js (which is not a direct dep).
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => {
        if (document.visibilityState === "visible") void runSync();
      },
    );
  }
  ch.subscribe();
  realtimeChannel = ch;
}

/** Wire all triggers. Call once after auth + boot. */
export function startSync(): () => void {
  if (started) return () => {};
  started = true;

  void ensureMigrated().then(() => void runSync());

  const onFocus = () => void runSync();
  const onVisible = () => {
    if (document.visibilityState === "visible") void runSync();
  };
  const onOnline = () => void runSync();
  const onOffline = () => setState("offline");

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  startRealtime();

  return () => {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    realtimeChannel?.unsubscribe();
    realtimeChannel = null;
    started = false;
  };
}

export { downloadPhotoBlob };
