"use client";

import { useEffect } from "react";
import { runRollover } from "@/lib/db/rollover";
import { seedIfEmpty } from "@/lib/db/seed";

let booted: Promise<void> | null = null;

/** One-time local boot (seed + rollover). Awaited by SyncBoot so the
 *  initial migration never measures a half-seeded database. */
export function boot() {
  if (!booted) {
    booted = (async () => {
      await seedIfEmpty();
      await runRollover();
    })();
  }
  return booted;
}

/**
 * Runs the one-time seed and the daily rollover on app open.
 * Views read the DB reactively (useLiveQuery), so they update automatically
 * once this completes — no need to block rendering.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    boot();
  }, []);
  return <>{children}</>;
}
