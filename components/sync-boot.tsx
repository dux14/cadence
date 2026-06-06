"use client";

import { useEffect } from "react";
import { boot } from "@/components/app-shell";
import { startSync } from "@/lib/sync/orchestrator";

/** Starts the sync engine only while the user is authenticated. */
export function SyncBoot() {
  useEffect(() => {
    // Wait for the local boot (seed/rollover) so ensureMigrated never runs
    // against a half-seeded database.
    let stop: (() => void) | null = null;
    let cancelled = false;
    void boot().then(() => {
      if (!cancelled) stop = startSync();
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return null;
}
