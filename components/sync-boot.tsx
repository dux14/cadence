"use client";

import { useEffect } from "react";
import { startSync } from "@/lib/sync/orchestrator";

/** Starts the sync engine only while the user is authenticated. */
export function SyncBoot() {
  useEffect(() => startSync(), []);
  return null;
}
