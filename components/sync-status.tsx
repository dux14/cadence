"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw, CloudOff } from "lucide-react";
import { onSyncState } from "@/lib/sync/orchestrator";
import type { SyncState } from "@/lib/sync/types";

export function SyncStatus() {
  const [state, setState] = useState<SyncState>("offline");
  useEffect(() => onSyncState(setState), []);

  const meta = {
    synced: { Icon: Check, label: "Sincronizado", cls: "text-emerald-500" },
    pending: { Icon: RefreshCw, label: "Sincronizando", cls: "text-amber-500 animate-spin" },
    offline: { Icon: CloudOff, label: "Sin conexión", cls: "text-muted" },
  }[state];

  return (
    <span
      className="inline-flex items-center"
      title={meta.label}
      aria-label={meta.label}
    >
      <meta.Icon className={`size-4 ${meta.cls}`} aria-hidden />
    </span>
  );
}
