"use client";

import { useEffect } from "react";
import { runRollover } from "@/lib/db/rollover";

let booted: Promise<void> | null = null;

/** One-time local boot (rollover). Awaited by SyncBoot so the initial
 *  migration never measures a half-booted database. No demo seed: with
 *  sync, a fresh device gets the user's real data from the server. */
export function boot() {
  if (!booted) {
    booted = (async () => {
      await runRollover();
    })();
  }
  return booted;
}

/**
 * Runs the daily rollover on app open.
 * Views read the DB reactively (useLiveQuery), so they update automatically
 * once this completes — no need to block rendering.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    boot();
  }, []);
  return <>{children}</>;
}
