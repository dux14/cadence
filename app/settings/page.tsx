"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { downloadSnapshot } from "@/lib/export";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const [busy, setBusy] = useState(false);

  async function exportJson() {
    setBusy(true);
    try {
      await downloadSnapshot();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <h1 className="font-display text-xl font-bold">Settings</h1>
      <p className="mb-6 mt-1 text-[13px] text-muted">
        Tu información vive solo en este dispositivo. Exporta una copia de
        seguridad cuando quieras.
      </p>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[15px] font-semibold">Copia de seguridad</h2>
        <p className="mt-1 mb-3 text-[13px] text-muted">
          Descarga todos tus proyectos, tasks, ideas y backlog como un archivo
          JSON.
        </p>
        <Button onClick={() => void exportJson()} disabled={busy}>
          <Download size={16} /> {busy ? "Exportando…" : "Export JSON"}
        </Button>
      </section>
    </div>
  );
}
