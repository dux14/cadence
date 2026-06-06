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
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 5_000;
const RETRY_DELAY_MAX = 60_000;
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
    retryDelay = 5_000;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    setState("synced");
  } catch {
    // Transient failure (network blip, 5xx, token refresh): retry with
    // backoff — external triggers (focus/online/write) are not guaranteed.
    setState("pending");
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void runSync(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_DELAY_MAX);
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
  // Same push lock as runSync so the migration never races a regular push
  // over the photo queue; double-check the flag once inside the lock.
  await withPushLock(async () => {
    if (await getMeta<boolean>("sync.migrated", false)) return;
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
  });
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
    // No user_id filter here: WALRUS applies RLS server-side, so this
    // channel only ever receives changes for the authenticated user.
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
    // removeChannel (not just unsubscribe) so repeated start/stop cycles
    // don't accumulate dead channels in the client registry.
    if (realtimeChannel) void getSupabase().removeChannel(realtimeChannel);
    realtimeChannel = null;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    started = false;
  };
}

export { downloadPhotoBlob };
