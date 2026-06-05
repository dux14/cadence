# SP1 — Modelo v2 + contenido rico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar el modelo de datos de Cadence de v1 a v2 sin pérdida de datos, añadiendo estados de task (`todo`/`in_progress`/`blocked`/`done`), un campo `due` unificado (timestamp con hora opcional) que reemplaza `time`, sub-tareas (checklist), títulos multilínea, links/due/checklist simétricos en ideas y backlog, identidad sync-ready (`guid`/`updatedAt`) y borrado lógico (tombstone vía `deletedAt`). La UI gana: indicador de estado que cicla con tap, sheet expandido con todos los campos editables, chips de preview en orden fijo `[due][checklist][links][fotos]`, due con formato relativo corto y rojo overdue, links como chips en ideas/backlog, y quick-add multilínea. Antes de migrar, un Settings mínimo expone export JSON completo como red de seguridad.

**Architecture:** Next.js 16 static export, React 19 con `"use client"`, Dexie 4 como única fuente de verdad local (reactivo vía `useLiveQuery`). La migración es in-place con `db.version(2).stores(...).upgrade(...)`: Dexie ejecuta `upgrade` una sola vez por dispositivo al abrir con la versión nueva, transformando cada fila existente. Los ids numéricos locales (`++id`) se conservan como PK; `guid` (UUID v4) se añade como columna nueva indexada para el sync futuro (SP4). Toda mutación pasa por `lib/db/queries.ts` y sella `updatedAt` vía un helper `touch()`. El borrado físico se sustituye por tombstone (`deletedAt = Date.now()`); todas las queries de lectura filtran `deletedAt == null`. La UI reutiliza el patrón Radix `Sheet`/`SheetContent` existente.

**Tech Stack:** Next.js 16.2.6 (`output: export`, build con `--webpack`), React 19.2.4, Dexie 4.4.3 + dexie-react-hooks 4.4.0, Tailwind 4, lucide-react 1.17.0 (iconos siempre, nunca emojis), Radix Dialog 1.1.15. Gestor de paquetes: **pnpm siempre**. Testing nuevo: vitest + fake-indexeddb (TDD real para la capa de datos).

---

## File Structure

Archivos a crear:

| Archivo | Responsabilidad |
|---|---|
| `lib/id.ts` | `newGuid()` — wrapper de `crypto.randomUUID()` con fallback. |
| `lib/due.ts` | Helpers de fecha de vencimiento: `formatDue(due, hasTime)` (relativo corto), `isOverdue(due)`, `dueToInputs(due, hasTime)` y `inputsToDue(date, time)` para el date+time picker. |
| `lib/multiline.ts` | `firstLines(text, n)` y `clamp` helpers para preview de título multilínea. |
| `lib/export.ts` | `exportSnapshot()` — serializa todas las tablas Dexie a un objeto JSON; `downloadSnapshot()` dispara la descarga en browser. |
| `lib/db/migrations.ts` | Funciones puras de transformación de fila v1→v2 (`migrateTaskV1`, `migrateIdeaV1`, `migrateBacklogV1`, `migrateProjectV1`), testeables sin IndexedDB. |
| `components/status-toggle.tsx` | Botón indicador de estado de task: iconos `Circle`/`CircleDot`/`CheckCircle2`/`Ban`; tap cicla `todo→in_progress→done→todo`. |
| `components/due-chip.tsx` | Chip de preview de due: `Clock` + `formatDue`, rojo si overdue. |
| `components/checklist-chip.tsx` | Chip pill `n/m` de progreso de checklist. |
| `components/checklist-editor.tsx` | Editor de sub-tareas dentro del sheet: añadir/togglear/borrar items + barra de progreso. |
| `components/due-picker.tsx` | Campo date + time picker para el sheet (controla `due`/`dueHasTime`). |
| `components/expand-button.tsx` | Botón "expandir" para quick-add móvil (toggle textarea multilínea). |
| `app/settings/page.tsx` | Settings mínimo con botón "Export JSON" (red de seguridad pre-migración). |
| `vitest.config.ts` | Config vitest (entorno node, setup fake-indexeddb). |
| `test/setup.ts` | Registra `fake-indexeddb/auto` antes de cada suite. |
| `test/migration.test.ts` | TDD migración v1→v2 (puro + integración Dexie). |
| `test/due.test.ts` | TDD helpers de due/formato. |
| `test/multiline.test.ts` | TDD parsing multilínea. |
| `test/queries.test.ts` | TDD tombstones filtrados + transferencia al promover + status cycle. |

Archivos a modificar:

| Archivo | Cambio |
|---|---|
| `lib/types.ts` | Tipos v2: `TaskStatus`, `Subtask`, campos nuevos en `Task`/`Idea`/`BacklogItem`/`Project`. |
| `lib/db/schema.ts` | `version(2).stores(...).upgrade(...)`; índices nuevos (`guid`, `updatedAt`, `deletedAt`, `due`). |
| `lib/db/queries.ts` | `touch()` helper; `addTask`/`addIdea`/`addBacklog` con guid/updatedAt/subtasks; `cycleTaskStatus`/`setTaskStatus`; `updateTask`/`updateIdea`/`updateBacklog` extendidos; soft-delete; queries filtran `deletedAt`; `promoteIdeaToTask` transfiere links/checklist/due. |
| `lib/db/rollover.ts` | Preservar `status`/`carried`; filtrar tombstones; sellar `updatedAt`. |
| `lib/db/seed.ts` | Seed crea filas v2 (guid/updatedAt/status `todo`). |
| `lib/date.ts` | (Sin cambios de firma; `formatTime` se reutiliza desde `lib/due.ts`.) |
| `components/task-row.tsx` | Status toggle; sheet expandido (estado, título multilínea, checklist, due picker, links); chips de preview en orden fijo. |
| `components/idea-row.tsx` | Sheet expandido simétrico (texto multilínea, checklist, due, links); chips de preview. |
| `app/historico/page.tsx` | Sheet expandido para backlog items (mismos campos). |
| `components/quick-add.tsx` | Textarea multilínea (Shift+Enter desktop, botón expandir móvil); reemplaza `time` por due picker. |
| `app/page.tsx` | Orden/sort usa `due` en vez de `time`; filtra tombstones. |
| `components/task-list.tsx` | Drag deshabilitado en tasks con `due` con hora (antes `time`). |
| `components/bottom-nav.tsx` | Entrada de navegación a Settings (icono `Settings`). |
| `package.json` | devDeps vitest + fake-indexeddb; script `test`. |

---

## Task 1: Setup de testing (vitest + fake-indexeddb)

**Files:**
- Create: `vitest.config.ts`
- Create: `test/setup.ts`
- Create: `test/smoke.test.ts`
- Modify: `package.json` (scripts)

- [ ] Instalar dependencias de test:
  ```bash
  pnpm add -D vitest fake-indexeddb
  ```
  Salida esperada: ambas en `devDependencies`; sin errores de peer.

- [ ] Crear `vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";
  import { resolve } from "node:path";

  export default defineConfig({
    test: {
      environment: "node",
      setupFiles: ["./test/setup.ts"],
      include: ["test/**/*.test.ts"],
    },
    resolve: {
      alias: { "@": resolve(__dirname, ".") },
    },
  });
  ```

- [ ] Crear `test/setup.ts`:
  ```ts
  import "fake-indexeddb/auto";
  ```

- [ ] Añadir el script `test` en `package.json` dentro de `"scripts"` (tras la línea de `"lint"`):
  ```json
  "test": "vitest run",
  ```

- [ ] Crear `test/smoke.test.ts` para verificar que el harness corre:
  ```ts
  import { describe, expect, it } from "vitest";

  describe("test harness", () => {
    it("has indexedDB available", () => {
      expect(typeof indexedDB).not.toBe("undefined");
    });
  });
  ```

- [ ] Ejecutar y verificar que pasa:
  ```bash
  pnpm test
  ```
  Salida esperada: `1 passed (1)`, exit code 0, y `indexedDB` definido (no error).

- [ ] Commit:
  ```bash
  git add package.json pnpm-lock.yaml vitest.config.ts test/setup.ts test/smoke.test.ts
  git commit -m "test: vitest + fake-indexeddb harness"
  ```

---

## Task 2: `lib/id.ts` — generación de GUID

**Files:**
- Create: `lib/id.ts`
- Create: `test/id.test.ts`

- [ ] Crear `test/id.test.ts` (RED — el módulo aún no existe):
  ```ts
  import { describe, expect, it } from "vitest";
  import { newGuid } from "@/lib/id";

  describe("newGuid", () => {
    it("returns a v4 UUID string", () => {
      const g = newGuid();
      expect(g).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("returns unique values", () => {
      const set = new Set(Array.from({ length: 1000 }, () => newGuid()));
      expect(set.size).toBe(1000);
    });
  });
  ```

- [ ] Verificar el fallo:
  ```bash
  pnpm test test/id.test.ts
  ```
  Salida esperada: falla por `Cannot find module '@/lib/id'`.

- [ ] Crear `lib/id.ts`:
  ```ts
  /**
   * UUID v4 for cross-device identity (sync in SP4). Uses the native
   * crypto.randomUUID when present, falling back to a getRandomValues-based
   * implementation for older environments.
   */
  export function newGuid(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return (
      hex.slice(0, 4).join("") +
      "-" +
      hex.slice(4, 6).join("") +
      "-" +
      hex.slice(6, 8).join("") +
      "-" +
      hex.slice(8, 10).join("") +
      "-" +
      hex.slice(10, 16).join("")
    );
  }
  ```

- [ ] Verificar que pasa:
  ```bash
  pnpm test test/id.test.ts
  ```
  Salida esperada: `2 passed`.

- [ ] Commit:
  ```bash
  git add lib/id.ts test/id.test.ts
  git commit -m "feat: newGuid (UUID v4) helper"
  ```

---

## Task 3: Tipos v2 (`lib/types.ts`)

**Files:**
- Modify: `lib/types.ts`

Este Task no tiene test propio (solo tipos); lo cubren los tests de Tasks 5–8 al compilar.

- [ ] Reemplazar las líneas 3-4 de `lib/types.ts` (la def de `TaskStatus` y `IdeaStatus`) por:
  ```ts
  export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
  export type IdeaStatus = "open" | "promoted";

  export interface Subtask {
    id: string;
    text: string;
    done: boolean;
  }
  ```

- [ ] Reemplazar la interfaz `Project` (líneas 6-14) añadiendo identidad sync-ready y tombstone:
  ```ts
  export interface Project {
    id?: number;
    guid: string;
    name: string;
    kind: ProjectKind;
    color: string;
    order: number;
    createdAt: number;
    updatedAt: number;
    archivedAt?: number | null;
    deletedAt?: number | null;
  }
  ```

- [ ] Reemplazar la interfaz `Task` (líneas 16-35) por la versión v2. El campo `time` desaparece (migrado a `due`):
  ```ts
  export interface Task {
    id?: number;
    guid: string;
    /** May contain "\n" — multiline title; preview clamps to ~2 lines. */
    title: string;
    links: string[];
    subtasks: Subtask[];
    projectId?: number | null;
    bucket: Bucket;
    status: TaskStatus;
    order: number;
    createdAt: number;
    updatedAt: number;
    completedAt?: number | null;
    /** Unified due timestamp (ms). dueHasTime distinguishes date-only. */
    due?: number | null;
    dueHasTime?: boolean;
    /** Rolled over from a previous day while still not done. */
    carried?: boolean;
    /** Date the task was placed into Today, e.g. "2026-06-02". */
    dayKey?: string | null;
    /** Archived done tasks live on for the History view. */
    archived?: boolean;
    archivedAt?: number | null;
    /** Tombstone: soft-deleted rows keep their id for sync. */
    deletedAt?: number | null;
  }
  ```

- [ ] Reemplazar la interfaz `Idea` (líneas 37-44) por la versión simétrica:
  ```ts
  export interface Idea {
    id?: number;
    guid: string;
    projectId: number;
    /** May contain "\n". */
    text: string;
    links: string[];
    subtasks: Subtask[];
    status: IdeaStatus;
    order: number;
    createdAt: number;
    updatedAt: number;
    due?: number | null;
    dueHasTime?: boolean;
    deletedAt?: number | null;
  }
  ```

- [ ] Reemplazar la interfaz `BacklogItem` (líneas 46-53) por la versión simétrica:
  ```ts
  export interface BacklogItem {
    id?: number;
    guid: string;
    title: string;
    note?: string;
    links: string[];
    subtasks: Subtask[];
    order: number;
    createdAt: number;
    updatedAt: number;
    due?: number | null;
    dueHasTime?: boolean;
    promotedProjectId?: number | null;
    deletedAt?: number | null;
  }
  ```

- [ ] Verificar que TypeScript no rompe en este archivo (los call sites se arreglan en Tasks siguientes; aquí solo confirmamos sintaxis del módulo de tipos):
  ```bash
  pnpm exec tsc --noEmit lib/types.ts 2>&1 | head -20
  ```
  Salida esperada: sin errores en `lib/types.ts` (puede haber errores en otros archivos por consumidores no actualizados — se resuelven en Tasks 5+; ignóralos aquí).

- [ ] Commit:
  ```bash
  git add lib/types.ts
  git commit -m "feat: v2 type contract (status, subtasks, due, guid, tombstones)"
  ```

---

## Task 4: Funciones de migración puras (`lib/db/migrations.ts`)

Transformaciones fila-a-fila, puras (sin IndexedDB), para poder testearlas con datos seed v1.

**Files:**
- Create: `lib/db/migrations.ts`
- Create: `test/migration.test.ts` (parte pura)

- [ ] Crear `test/migration.test.ts` con la suite de transformación pura (RED):
  ```ts
  import { describe, expect, it } from "vitest";
  import {
    migrateTaskV1,
    migrateIdeaV1,
    migrateBacklogV1,
    migrateProjectV1,
  } from "@/lib/db/migrations";

  describe("migrateTaskV1", () => {
    it("maps open -> todo", () => {
      const out = migrateTaskV1({
        id: 1,
        title: "x",
        links: [],
        bucket: "today",
        status: "open",
        order: 0,
        createdAt: 100,
      });
      expect(out.status).toBe("todo");
    });

    it("maps done -> done", () => {
      const out = migrateTaskV1({
        id: 2,
        title: "x",
        links: [],
        bucket: "today",
        status: "done",
        order: 0,
        createdAt: 100,
      });
      expect(out.status).toBe("done");
    });

    it("converts a today task with time into a dated due with hour", () => {
      const out = migrateTaskV1({
        id: 3,
        title: "x",
        links: [],
        bucket: "today",
        status: "open",
        order: 0,
        createdAt: 100,
        time: "15:00",
        dayKey: "2026-06-02",
      });
      const d = new Date(out.due!);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(5); // June (0-based)
      expect(d.getDate()).toBe(2);
      expect(d.getHours()).toBe(15);
      expect(d.getMinutes()).toBe(0);
      expect(out.dueHasTime).toBe(true);
    });

    it("drops the time field after migration", () => {
      const out = migrateTaskV1({
        id: 4,
        title: "x",
        links: [],
        bucket: "today",
        status: "open",
        order: 0,
        createdAt: 100,
        time: "09:30",
        dayKey: "2026-06-02",
      }) as Record<string, unknown>;
      expect("time" in out).toBe(false);
    });

    it("leaves due null when there was no time", () => {
      const out = migrateTaskV1({
        id: 5,
        title: "x",
        links: [],
        bucket: "week",
        status: "open",
        order: 0,
        createdAt: 100,
      });
      expect(out.due ?? null).toBeNull();
      expect(out.dueHasTime).toBe(false);
    });

    it("falls back to today's date when time exists without dayKey", () => {
      const out = migrateTaskV1({
        id: 6,
        title: "x",
        links: [],
        bucket: "today",
        status: "open",
        order: 0,
        createdAt: 100,
        time: "08:00",
      });
      expect(out.due).not.toBeNull();
      expect(out.dueHasTime).toBe(true);
    });

    it("adds a guid, updatedAt, empty subtasks and null deletedAt", () => {
      const out = migrateTaskV1({
        id: 7,
        title: "x",
        links: [],
        bucket: "today",
        status: "open",
        order: 0,
        createdAt: 100,
      });
      expect(out.guid).toMatch(/^[0-9a-f-]{36}$/i);
      expect(typeof out.updatedAt).toBe("number");
      expect(out.subtasks).toEqual([]);
      expect(out.deletedAt ?? null).toBeNull();
    });

    it("preserves existing fields (links, order, carried, archived)", () => {
      const out = migrateTaskV1({
        id: 8,
        title: "keep me",
        links: ["https://a.com"],
        bucket: "tomorrow",
        status: "open",
        order: 5,
        createdAt: 100,
        carried: true,
        archived: true,
        archivedAt: 200,
        completedAt: null,
      });
      expect(out.title).toBe("keep me");
      expect(out.links).toEqual(["https://a.com"]);
      expect(out.order).toBe(5);
      expect(out.carried).toBe(true);
      expect(out.archived).toBe(true);
      expect(out.archivedAt).toBe(200);
    });
  });

  describe("migrateIdeaV1", () => {
    it("adds links, subtasks, guid, updatedAt and keeps text/status", () => {
      const out = migrateIdeaV1({
        id: 1,
        projectId: 9,
        text: "an idea",
        status: "open",
        order: 2,
        createdAt: 100,
      });
      expect(out.text).toBe("an idea");
      expect(out.status).toBe("open");
      expect(out.projectId).toBe(9);
      expect(out.links).toEqual([]);
      expect(out.subtasks).toEqual([]);
      expect(out.guid).toMatch(/^[0-9a-f-]{36}$/i);
      expect(typeof out.updatedAt).toBe("number");
      expect(out.deletedAt ?? null).toBeNull();
    });
  });

  describe("migrateBacklogV1", () => {
    it("adds links, subtasks, guid, updatedAt and keeps title/note", () => {
      const out = migrateBacklogV1({
        id: 1,
        title: "future",
        note: "a note",
        order: 0,
        createdAt: 100,
        promotedProjectId: null,
      });
      expect(out.title).toBe("future");
      expect(out.note).toBe("a note");
      expect(out.links).toEqual([]);
      expect(out.subtasks).toEqual([]);
      expect(out.guid).toMatch(/^[0-9a-f-]{36}$/i);
      expect(out.deletedAt ?? null).toBeNull();
    });
  });

  describe("migrateProjectV1", () => {
    it("adds guid, updatedAt and null deletedAt, keeps name/kind/color", () => {
      const out = migrateProjectV1({
        id: 1,
        name: "HKN",
        kind: "active",
        color: "#A9C8EE",
        order: 0,
        createdAt: 100,
        archivedAt: null,
      });
      expect(out.name).toBe("HKN");
      expect(out.kind).toBe("active");
      expect(out.color).toBe("#A9C8EE");
      expect(out.guid).toMatch(/^[0-9a-f-]{36}$/i);
      expect(typeof out.updatedAt).toBe("number");
      expect(out.deletedAt ?? null).toBeNull();
    });
  });
  ```

- [ ] Verificar el fallo:
  ```bash
  pnpm test test/migration.test.ts
  ```
  Salida esperada: falla por `Cannot find module '@/lib/db/migrations'`.

- [ ] Crear `lib/db/migrations.ts`:
  ```ts
  import { newGuid } from "@/lib/id";
  import type { BacklogItem, Idea, Project, Task } from "@/lib/types";

  /** Shape of v1 rows as they exist on disk before the v2 upgrade. */
  interface TaskV1 {
    id?: number;
    title: string;
    links: string[];
    projectId?: number | null;
    bucket: "today" | "tomorrow" | "week";
    status: "open" | "done";
    order: number;
    createdAt: number;
    completedAt?: number | null;
    time?: string | null;
    carried?: boolean;
    dayKey?: string | null;
    archived?: boolean;
    archivedAt?: number | null;
  }

  interface IdeaV1 {
    id?: number;
    projectId: number;
    text: string;
    status: "open" | "promoted";
    order: number;
    createdAt: number;
  }

  interface BacklogV1 {
    id?: number;
    title: string;
    note?: string;
    order: number;
    createdAt: number;
    promotedProjectId?: number | null;
  }

  interface ProjectV1 {
    id?: number;
    name: string;
    kind: "active" | "area";
    color: string;
    order: number;
    createdAt: number;
    archivedAt?: number | null;
  }

  /** Local "HH:mm" + dayKey -> epoch ms in local time. */
  function timeToDue(time: string, dayKey: string | null | undefined): number {
    const [h, m] = time.split(":").map(Number);
    let y: number, mo: number, d: number;
    if (dayKey) {
      const [yy, mm, dd] = dayKey.split("-").map(Number);
      y = yy;
      mo = mm - 1;
      d = dd;
    } else {
      const now = new Date();
      y = now.getFullYear();
      mo = now.getMonth();
      d = now.getDate();
    }
    return new Date(y, mo, d, h, m, 0, 0).getTime();
  }

  export function migrateTaskV1(t: TaskV1): Task {
    const hasTime = typeof t.time === "string" && t.time.length > 0;
    return {
      id: t.id,
      guid: newGuid(),
      title: t.title,
      links: t.links ?? [],
      subtasks: [],
      projectId: t.projectId ?? null,
      bucket: t.bucket,
      status: t.status === "done" ? "done" : "todo",
      order: t.order,
      createdAt: t.createdAt,
      updatedAt: t.createdAt,
      completedAt: t.completedAt ?? null,
      due: hasTime ? timeToDue(t.time as string, t.dayKey) : null,
      dueHasTime: hasTime,
      carried: t.carried ?? false,
      dayKey: t.dayKey ?? null,
      archived: t.archived ?? false,
      archivedAt: t.archivedAt ?? null,
      deletedAt: null,
    };
  }

  export function migrateIdeaV1(i: IdeaV1): Idea {
    return {
      id: i.id,
      guid: newGuid(),
      projectId: i.projectId,
      text: i.text,
      links: [],
      subtasks: [],
      status: i.status,
      order: i.order,
      createdAt: i.createdAt,
      updatedAt: i.createdAt,
      due: null,
      dueHasTime: false,
      deletedAt: null,
    };
  }

  export function migrateBacklogV1(b: BacklogV1): BacklogItem {
    return {
      id: b.id,
      guid: newGuid(),
      title: b.title,
      note: b.note,
      links: [],
      subtasks: [],
      order: b.order,
      createdAt: b.createdAt,
      updatedAt: b.createdAt,
      due: null,
      dueHasTime: false,
      promotedProjectId: b.promotedProjectId ?? null,
      deletedAt: null,
    };
  }

  export function migrateProjectV1(p: ProjectV1): Project {
    return {
      id: p.id,
      guid: newGuid(),
      name: p.name,
      kind: p.kind,
      color: p.color,
      order: p.order,
      createdAt: p.createdAt,
      updatedAt: p.createdAt,
      archivedAt: p.archivedAt ?? null,
      deletedAt: null,
    };
  }
  ```

- [ ] Verificar que pasa:
  ```bash
  pnpm test test/migration.test.ts
  ```
  Salida esperada: todos los tests de transformación pura pasan (verde).

- [ ] Commit:
  ```bash
  git add lib/db/migrations.ts test/migration.test.ts
  git commit -m "feat: pure v1->v2 row migration functions + tests"
  ```

---

## Task 5: Dexie `version(2)` con upgrade in-place

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `test/migration.test.ts` (añadir suite de integración Dexie)

- [ ] Añadir al final de `test/migration.test.ts` la suite de integración que escribe filas v1 con un Dexie temporal v1 y verifica el upgrade a v2 (RED — el upgrade aún no existe). Usar un nombre de DB único por test para aislar fake-indexeddb:
  ```ts
  import Dexie from "dexie";
  import { db } from "@/lib/db/schema";

  describe("Dexie v1 -> v2 in-place upgrade", () => {
    it("preserves row counts and converts fields without loss", async () => {
      // 1. Seed a v1-shaped database under the production DB name.
      const v1 = new Dexie("cadence");
      v1.version(1).stores({
        projects: "++id, kind, order, archivedAt",
        tasks: "++id, bucket, status, projectId, dayKey, completedAt",
        ideas: "++id, projectId, status",
        backlog: "++id, order",
        meta: "&key",
      });
      await v1.open();
      await v1.table("projects").add({
        name: "HKN",
        kind: "active",
        color: "#A9C8EE",
        order: 0,
        createdAt: 100,
        archivedAt: null,
      });
      await v1.table("tasks").bulkAdd([
        {
          title: "open one",
          links: [],
          projectId: 1,
          bucket: "today",
          status: "open",
          order: 0,
          createdAt: 100,
          time: "15:00",
          dayKey: "2026-06-02",
          carried: false,
          archived: false,
        },
        {
          title: "done one",
          links: ["https://a.com"],
          bucket: "week",
          status: "done",
          order: 1,
          createdAt: 100,
          completedAt: 150,
          archived: false,
        },
      ]);
      await v1.table("ideas").add({
        projectId: 1,
        text: "idea",
        status: "open",
        order: 0,
        createdAt: 100,
      });
      await v1.table("backlog").add({
        title: "parked",
        order: 0,
        createdAt: 100,
        promotedProjectId: null,
      });
      v1.close();

      // 2. Open the production db (version 2) -> triggers upgrade.
      await db.open();

      // 3. Counts preserved.
      expect(await db.tasks.count()).toBe(2);
      expect(await db.projects.count()).toBe(1);
      expect(await db.ideas.count()).toBe(1);
      expect(await db.backlog.count()).toBe(1);

      // 4. open -> todo, time -> due with hour.
      const open = await db.tasks.where("status").equals("todo").first();
      expect(open?.title).toBe("open one");
      expect(open?.dueHasTime).toBe(true);
      expect(new Date(open!.due!).getHours()).toBe(15);
      expect((open as Record<string, unknown>).time).toBeUndefined();

      // 5. done preserved.
      const done = await db.tasks.where("status").equals("done").first();
      expect(done?.status).toBe("done");

      // 6. Unique guids across all tasks.
      const tasks = await db.tasks.toArray();
      const guids = new Set(tasks.map((t) => t.guid));
      expect(guids.size).toBe(tasks.length);
      tasks.forEach((t) => expect(typeof t.guid).toBe("string"));

      // 7. New collections gained links/subtasks.
      const idea = await db.ideas.toArray();
      expect(idea[0].links).toEqual([]);
      expect(idea[0].subtasks).toEqual([]);
      expect(idea[0].guid).toBeTruthy();
    });
  });
  ```

  > Nota para el ejecutor: si fake-indexeddb arrastra estado entre suites de un mismo proceso, añade un `beforeEach` que borre la DB con `await Dexie.delete("cadence")` al inicio de esta suite de integración. Verifica primero corriendo el archivo solo.

- [ ] Verificar el fallo:
  ```bash
  pnpm test test/migration.test.ts
  ```
  Salida esperada: la suite de integración falla (campos v2 ausentes / no hay `version(2)`).

- [ ] Reescribir `lib/db/schema.ts`. Importar las funciones de migración y añadir `version(2)` con `upgrade`. Mantener `version(1)` intacto (Dexie necesita la cadena de versiones para upgrades incrementales):
  ```ts
  import Dexie, { type Table } from "dexie";
  import type { BacklogItem, Idea, Project, Task } from "@/lib/types";
  import {
    migrateBacklogV1,
    migrateIdeaV1,
    migrateProjectV1,
    migrateTaskV1,
  } from "@/lib/db/migrations";

  export interface Meta {
    key: string;
    value: unknown;
  }

  export class CadenceDB extends Dexie {
    projects!: Table<Project, number>;
    tasks!: Table<Task, number>;
    ideas!: Table<Idea, number>;
    backlog!: Table<BacklogItem, number>;
    meta!: Table<Meta, string>;

    constructor() {
      super("cadence");

      this.version(1).stores({
        projects: "++id, kind, order, archivedAt",
        tasks: "++id, bucket, status, projectId, dayKey, completedAt",
        ideas: "++id, projectId, status",
        backlog: "++id, order",
        meta: "&key",
      });

      this.version(2)
        .stores({
          projects: "++id, &guid, kind, order, archivedAt, updatedAt, deletedAt",
          tasks:
            "++id, &guid, bucket, status, projectId, dayKey, completedAt, due, updatedAt, deletedAt",
          ideas: "++id, &guid, projectId, status, updatedAt, deletedAt",
          backlog: "++id, &guid, order, updatedAt, deletedAt",
          meta: "&key",
        })
        .upgrade(async (tx) => {
          await tx
            .table("projects")
            .toCollection()
            .modify((p) => {
              Object.assign(p, migrateProjectV1({ ...p }));
            });
          await tx
            .table("tasks")
            .toCollection()
            .modify((t) => {
              const next = migrateTaskV1({ ...t });
              for (const k of Object.keys(t)) delete (t as Record<string, unknown>)[k];
              Object.assign(t, next);
            });
          await tx
            .table("ideas")
            .toCollection()
            .modify((i) => {
              Object.assign(i, migrateIdeaV1({ ...i }));
            });
          await tx
            .table("backlog")
            .toCollection()
            .modify((b) => {
              Object.assign(b, migrateBacklogV1({ ...b }));
            });
        });
    }
  }

  export const db = new CadenceDB();

  export async function getMeta<T>(key: string, fallback: T): Promise<T> {
    const row = await db.meta.get(key);
    return row ? (row.value as T) : fallback;
  }

  export async function setMeta(key: string, value: unknown): Promise<void> {
    await db.meta.put({ key, value });
  }
  ```

  > Nota de diseño: para `tasks` se borran las claves originales antes de `Object.assign` para garantizar que el campo `time` desaparece físicamente (no solo se ignora). Para las demás tablas un `Object.assign` basta porque no eliminan campos. El índice `&guid` es único; los guids se generan dentro de `migrate*V1` y son únicos por fila.

- [ ] Verificar que pasa:
  ```bash
  pnpm test test/migration.test.ts
  ```
  Salida esperada: la suite de integración pasa (counts preservados, `open→todo`, `time→due` con hora 15, `time` undefined, guids únicos, links/subtasks en ideas).

- [ ] Commit:
  ```bash
  git add lib/db/schema.ts test/migration.test.ts
  git commit -m "feat: Dexie version(2) in-place upgrade v1->v2"
  ```

---

## Task 6: `lib/due.ts` — helpers de vencimiento

**Files:**
- Create: `lib/due.ts`
- Create: `test/due.test.ts`

- [ ] Crear `test/due.test.ts` (RED). Construimos timestamps relativos a una fecha fija para que el test sea determinista:
  ```ts
  import { describe, expect, it } from "vitest";
  import {
    formatDue,
    isOverdue,
    dueToInputs,
    inputsToDue,
  } from "@/lib/due";

  const at = (y: number, mo: number, d: number, h = 0, mi = 0) =>
    new Date(y, mo, d, h, mi, 0, 0).getTime();

  describe("isOverdue", () => {
    it("is true for a past timestamp", () => {
      expect(isOverdue(Date.now() - 60_000)).toBe(true);
    });
    it("is false for a future timestamp", () => {
      expect(isOverdue(Date.now() + 60_000)).toBe(true === false ? 0 : false);
    });
    it("is false for null", () => {
      expect(isOverdue(null)).toBe(false);
      expect(isOverdue(undefined)).toBe(false);
    });
  });

  describe("formatDue", () => {
    it("shows the time for a due today with hour", () => {
      const now = new Date();
      const due = at(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0);
      const out = formatDue(due, true, now);
      expect(out.toLowerCase()).toContain("hoy");
    });

    it("shows a short month+day for a date-only due in another month", () => {
      const now = at(2026, 5, 5); // Jun 5
      const due = at(2026, 5, 12); // Jun 12
      const out = formatDue(due, false, new Date(now));
      expect(out).toMatch(/12/);
    });

    it("returns empty string for null", () => {
      expect(formatDue(null, false)).toBe("");
    });
  });

  describe("dueToInputs / inputsToDue round-trip", () => {
    it("splits a timestamp into date and time inputs", () => {
      const due = at(2026, 5, 12, 9, 30);
      const { date, time } = dueToInputs(due, true);
      expect(date).toBe("2026-06-12");
      expect(time).toBe("09:30");
    });

    it("omits time when dueHasTime is false", () => {
      const due = at(2026, 5, 12);
      const { date, time } = dueToInputs(due, false);
      expect(date).toBe("2026-06-12");
      expect(time).toBe("");
    });

    it("rebuilds a timestamp from date + time", () => {
      const { due, dueHasTime } = inputsToDue("2026-06-12", "09:30");
      expect(dueHasTime).toBe(true);
      expect(dueToInputs(due!, true)).toEqual({ date: "2026-06-12", time: "09:30" });
    });

    it("rebuilds a date-only timestamp when time is empty", () => {
      const { due, dueHasTime } = inputsToDue("2026-06-12", "");
      expect(dueHasTime).toBe(false);
      expect(due).not.toBeNull();
    });

    it("returns null due when date is empty", () => {
      expect(inputsToDue("", "09:30")).toEqual({ due: null, dueHasTime: false });
    });
  });
  ```

  > Nota para el ejecutor: corrige la línea del segundo test de `isOverdue` a `expect(isOverdue(Date.now() + 60_000)).toBe(false);` antes de implementar — el placeholder enrevesado de arriba es solo para forzar que pienses el assert; reescríbelo limpio.

- [ ] Verificar el fallo:
  ```bash
  pnpm test test/due.test.ts
  ```
  Salida esperada: falla por módulo inexistente.

- [ ] Crear `lib/due.ts`:
  ```ts
  import { localDateKey } from "@/lib/date";

  /** True if `due` is a timestamp strictly in the past. */
  export function isOverdue(due?: number | null): boolean {
    return typeof due === "number" && due < Date.now();
  }

  /** "HH:mm" 24h -> "3pm" / "3:30pm" (no space, lowercase, short). */
  function shortTime(h: number, m: number): string {
    const hour = h % 12 || 12;
    const mer = h < 12 ? "am" : "pm";
    return m === 0 ? `${hour}${mer}` : `${hour}:${String(m).padStart(2, "0")}${mer}`;
  }

  const MONTHS = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];

  /**
   * Short relative label for a due date.
   *  - same day:        "hoy 3pm" (with time) / "hoy" (date-only)
   *  - tomorrow:        "mañana 3pm" / "mañana"
   *  - other this year: "jun 12 3pm" / "jun 12"
   */
  export function formatDue(
    due: number | null | undefined,
    hasTime: boolean,
    now: Date = new Date(),
  ): string {
    if (typeof due !== "number") return "";
    const d = new Date(due);
    const dueKey = localDateKey(d);
    const todayKey = localDateKey(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowKey = localDateKey(tomorrow);

    const time = hasTime ? shortTime(d.getHours(), d.getMinutes()) : "";

    let day: string;
    if (dueKey === todayKey) day = "hoy";
    else if (dueKey === tomorrowKey) day = "mañana";
    else day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;

    return time ? `${day} ${time}` : day;
  }

  /** Split a due timestamp into <input type="date"> + <input type="time"> values. */
  export function dueToInputs(
    due: number,
    hasTime: boolean,
  ): { date: string; time: string } {
    const d = new Date(due);
    const date = localDateKey(d);
    const time = hasTime
      ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      : "";
    return { date, time };
  }

  /** Build a due timestamp from date (YYYY-MM-DD) + optional time (HH:mm). */
  export function inputsToDue(
    date: string,
    time: string,
  ): { due: number | null; dueHasTime: boolean } {
    if (!date) return { due: null, dueHasTime: false };
    const [y, mo, d] = date.split("-").map(Number);
    if (time) {
      const [h, mi] = time.split(":").map(Number);
      return { due: new Date(y, mo - 1, d, h, mi, 0, 0).getTime(), dueHasTime: true };
    }
    return { due: new Date(y, mo - 1, d, 0, 0, 0, 0).getTime(), dueHasTime: false };
  }
  ```

- [ ] Verificar que pasa (tras corregir el assert de `isOverdue` futuro):
  ```bash
  pnpm test test/due.test.ts
  ```
  Salida esperada: todos verdes.

- [ ] Commit:
  ```bash
  git add lib/due.ts test/due.test.ts
  git commit -m "feat: due-date helpers (format, overdue, input round-trip)"
  ```

---

## Task 7: `lib/multiline.ts` — preview multilínea

**Files:**
- Create: `lib/multiline.ts`
- Create: `test/multiline.test.ts`

- [ ] Crear `test/multiline.test.ts` (RED):
  ```ts
  import { describe, expect, it } from "vitest";
  import { firstLines } from "@/lib/multiline";

  describe("firstLines", () => {
    it("returns the whole text when within the line budget", () => {
      expect(firstLines("a\nb", 2)).toBe("a\nb");
    });

    it("clamps to n lines and appends an ellipsis", () => {
      expect(firstLines("a\nb\nc\nd", 2)).toBe("a\nb…");
    });

    it("treats single-line text untouched", () => {
      expect(firstLines("just one line", 2)).toBe("just one line");
    });

    it("trims trailing empty lines before clamping", () => {
      expect(firstLines("a\n\n\n", 2)).toBe("a");
    });

    it("handles an empty string", () => {
      expect(firstLines("", 2)).toBe("");
    });
  });
  ```

- [ ] Verificar el fallo:
  ```bash
  pnpm test test/multiline.test.ts
  ```
  Salida esperada: módulo inexistente.

- [ ] Crear `lib/multiline.ts`:
  ```ts
  /**
   * First `n` non-empty-trailing lines of a multiline string, with a trailing
   * ellipsis when content was dropped. Used for row previews; the full text
   * lives in the expanded sheet.
   */
  export function firstLines(text: string, n: number): string {
    const lines = text.replace(/\s+$/, "").split("\n");
    if (lines.length <= n) return lines.join("\n");
    return lines.slice(0, n).join("\n") + "…";
  }
  ```

- [ ] Verificar que pasa:
  ```bash
  pnpm test test/multiline.test.ts
  ```
  Salida esperada: todos verdes.

- [ ] Commit:
  ```bash
  git add lib/multiline.ts test/multiline.test.ts
  git commit -m "feat: multiline preview helper"
  ```

---

## Task 8: Queries v2 — touch, status, soft-delete, tombstones, promote

**Files:**
- Modify: `lib/db/queries.ts`
- Create: `test/queries.test.ts`

- [ ] Crear `test/queries.test.ts` (RED). Limpia la DB en `beforeEach` para aislar:
  ```ts
  import { beforeEach, describe, expect, it } from "vitest";
  import Dexie from "dexie";
  import { db } from "@/lib/db/schema";
  import {
    addTask,
    cycleTaskStatus,
    setTaskStatus,
    deleteTask,
    listTasks,
    addIdea,
    promoteIdeaToTask,
    updateIdea,
    deleteIdea,
    listIdeas,
  } from "@/lib/db/queries";

  beforeEach(async () => {
    db.close();
    await Dexie.delete("cadence");
    await db.open();
  });

  describe("status cycle", () => {
    it("cycles todo -> in_progress -> done -> todo", async () => {
      const id = await addTask({ title: "x", bucket: "today" });
      let t = (await db.tasks.get(id))!;
      expect(t.status).toBe("todo");

      await cycleTaskStatus(t);
      t = (await db.tasks.get(id))!;
      expect(t.status).toBe("in_progress");

      await cycleTaskStatus(t);
      t = (await db.tasks.get(id))!;
      expect(t.status).toBe("done");
      expect(t.completedAt).not.toBeNull();

      await cycleTaskStatus(t);
      t = (await db.tasks.get(id))!;
      expect(t.status).toBe("todo");
      expect(t.completedAt).toBeNull();
    });

    it("setTaskStatus can set blocked and bumps updatedAt", async () => {
      const id = await addTask({ title: "x", bucket: "today" });
      const before = (await db.tasks.get(id))!.updatedAt;
      await new Promise((r) => setTimeout(r, 2));
      await setTaskStatus(id, "blocked");
      const t = (await db.tasks.get(id))!;
      expect(t.status).toBe("blocked");
      expect(t.updatedAt).toBeGreaterThan(before);
    });
  });

  describe("tombstones", () => {
    it("deleteTask soft-deletes and listTasks hides it", async () => {
      const id = await addTask({ title: "gone", bucket: "today" });
      await deleteTask(id);
      const row = await db.tasks.get(id);
      expect(row).toBeTruthy();
      expect(row!.deletedAt).not.toBeNull();
      const visible = await listTasks("today");
      expect(visible.find((t) => t.id === id)).toBeUndefined();
    });

    it("deleteIdea soft-deletes and listIdeas hides it", async () => {
      const id = await addIdea(1, "idea");
      await deleteIdea(id);
      const visible = await listIdeas(1);
      expect(visible.find((i) => i.id === id)).toBeUndefined();
      expect((await db.ideas.get(id))!.deletedAt).not.toBeNull();
    });
  });

  describe("promoteIdeaToTask transfers content", () => {
    it("carries links, subtasks and due to the new task", async () => {
      const id = await addIdea(7, "an idea");
      await updateIdea(id, {
        links: ["https://a.com"],
        subtasks: [{ id: "s1", text: "step", done: false }],
        due: 1234,
        dueHasTime: true,
      });
      const idea = (await db.ideas.get(id))!;
      await promoteIdeaToTask(idea, "today");

      const task = await db.tasks.where("title").equals("an idea").first();
      expect(task).toBeTruthy();
      expect(task!.links).toEqual(["https://a.com"]);
      expect(task!.subtasks).toEqual([{ id: "s1", text: "step", done: false }]);
      expect(task!.due).toBe(1234);
      expect(task!.dueHasTime).toBe(true);
      expect(task!.projectId).toBe(7);

      expect((await db.ideas.get(id))!.status).toBe("promoted");
    });
  });

  describe("addTask defaults", () => {
    it("assigns guid, updatedAt, empty subtasks, status todo", async () => {
      const id = await addTask({ title: "x", bucket: "week" });
      const t = (await db.tasks.get(id))!;
      expect(t.guid).toMatch(/^[0-9a-f-]{36}$/i);
      expect(typeof t.updatedAt).toBe("number");
      expect(t.subtasks).toEqual([]);
      expect(t.status).toBe("todo");
      expect(t.deletedAt).toBeNull();
    });
  });
  ```

- [ ] Verificar el fallo:
  ```bash
  pnpm test test/queries.test.ts
  ```
  Salida esperada: falla (funciones inexistentes: `cycleTaskStatus`, `setTaskStatus`, `listTasks`, `updateIdea`, `listIdeas`).

- [ ] Reescribir `lib/db/queries.ts`. Reemplazar el bloque entero del archivo por la versión v2 a continuación (mantiene los nombres existentes que la UI usa y añade los nuevos):
  ```ts
  import { type Table } from "dexie";
  import { db } from "@/lib/db/schema";
  import { PROJECT_COLORS } from "@/lib/constants";
  import { localDateKey } from "@/lib/date";
  import { newGuid } from "@/lib/id";
  import type {
    Bucket,
    BacklogItem,
    Idea,
    Project,
    ProjectKind,
    Subtask,
    Task,
    TaskStatus,
  } from "@/lib/types";

  /** Fresh updatedAt stamp for any local write (sync-ready). */
  function touch(): number {
    return Date.now();
  }

  // ---------- Projects ----------

  export async function addProject(name: string, kind: ProjectKind): Promise<number> {
    const count = await db.projects.count();
    const max = await maxOrder(db.projects);
    const color = PROJECT_COLORS[count % PROJECT_COLORS.length];
    const now = touch();
    return db.projects.add({
      guid: newGuid(),
      name: name.trim(),
      kind,
      color,
      order: max + 1,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    });
  }

  export async function updateProject(
    id: number,
    changes: { name?: string; color?: string; kind?: ProjectKind },
  ): Promise<void> {
    await db.projects.update(id, {
      ...changes,
      ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
      updatedAt: touch(),
    });
  }

  export async function listProjects(): Promise<Project[]> {
    const rows = await db.projects.orderBy("order").toArray();
    return rows.filter((p) => p.deletedAt == null);
  }

  export async function deleteProject(id: number): Promise<void> {
    const now = touch();
    await db.transaction("rw", db.projects, db.tasks, db.ideas, async () => {
      const ideas = await db.ideas.where("projectId").equals(id).toArray();
      for (const i of ideas) await db.ideas.update(i.id!, { deletedAt: now, updatedAt: now });
      // Detach tasks rather than tombstone them.
      const tasks = await db.tasks.where("projectId").equals(id).toArray();
      for (const t of tasks)
        await db.tasks.update(t.id!, { projectId: null, updatedAt: now });
      await db.projects.update(id, { deletedAt: now, updatedAt: now });
    });
  }

  // ---------- Tasks ----------

  export async function addTask(input: {
    title: string;
    links?: string[];
    subtasks?: Subtask[];
    projectId?: number | null;
    bucket: Bucket;
    due?: number | null;
    dueHasTime?: boolean;
  }): Promise<number> {
    const max = await maxTaskOrder(input.bucket);
    const now = touch();
    return db.tasks.add({
      guid: newGuid(),
      title: input.title.trim(),
      links: input.links ?? [],
      subtasks: input.subtasks ?? [],
      projectId: input.projectId ?? null,
      bucket: input.bucket,
      due: input.due ?? null,
      dueHasTime: input.dueHasTime ?? false,
      status: "todo",
      order: max + 1,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      carried: false,
      dayKey: input.bucket === "today" ? localDateKey() : null,
      archived: false,
      deletedAt: null,
    });
  }

  export async function listTasks(bucket: Bucket): Promise<Task[]> {
    const rows = await db.tasks.where("bucket").equals(bucket).toArray();
    return rows.filter((t) => t.deletedAt == null && !t.archived);
  }

  const STATUS_CYCLE: TaskStatus[] = ["todo", "in_progress", "done"];

  /** Tap-cycle a task through todo -> in_progress -> done -> todo. */
  export async function cycleTaskStatus(task: Task): Promise<void> {
    const i = STATUS_CYCLE.indexOf(task.status);
    // blocked is off-cycle; tapping a blocked task returns it to todo.
    const next = i === -1 ? "todo" : STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
    await setTaskStatus(task.id!, next);
  }

  /** Explicit status set (used by the sheet selector, incl. blocked). */
  export async function setTaskStatus(id: number, status: TaskStatus): Promise<void> {
    await db.tasks.update(id, {
      status,
      completedAt: status === "done" ? Date.now() : null,
      updatedAt: touch(),
    });
  }

  /** Back-compat alias for the old binary toggle (toggles done <-> todo). */
  export async function toggleTask(task: Task): Promise<void> {
    await setTaskStatus(task.id!, task.status === "done" ? "todo" : "done");
  }

  export async function updateTask(
    id: number,
    changes: {
      title?: string;
      projectId?: number | null;
      links?: string[];
      subtasks?: Subtask[];
      due?: number | null;
      dueHasTime?: boolean;
    },
  ): Promise<void> {
    await db.tasks.update(id, {
      ...changes,
      ...(changes.title !== undefined ? { title: changes.title.trim() } : {}),
      updatedAt: touch(),
    });
  }

  export async function moveTask(id: number, bucket: Bucket): Promise<void> {
    const max = await maxTaskOrder(bucket);
    await db.tasks.update(id, {
      bucket,
      order: max + 1,
      dayKey: bucket === "today" ? localDateKey() : null,
      updatedAt: touch(),
    });
  }

  export async function deleteTask(id: number): Promise<void> {
    const now = touch();
    await db.tasks.update(id, { deletedAt: now, updatedAt: now });
  }

  export async function reorderTasks(orderedIds: number[]): Promise<void> {
    const now = touch();
    await db.transaction("rw", db.tasks, async () => {
      await Promise.all(
        orderedIds.map((id, i) => db.tasks.update(id, { order: i, updatedAt: now })),
      );
    });
  }

  // ---------- Ideas ----------

  export async function addIdea(projectId: number, text: string): Promise<number> {
    const max = await maxOrderWhere(db.ideas, "projectId", projectId);
    const now = touch();
    return db.ideas.add({
      guid: newGuid(),
      projectId,
      text: text.trim(),
      links: [],
      subtasks: [],
      status: "open",
      order: max + 1,
      createdAt: now,
      updatedAt: now,
      due: null,
      dueHasTime: false,
      deletedAt: null,
    });
  }

  export async function listIdeas(projectId: number): Promise<Idea[]> {
    const rows = await db.ideas.where("projectId").equals(projectId).toArray();
    return rows.filter((i) => i.deletedAt == null);
  }

  export async function updateIdeaText(id: number, text: string): Promise<void> {
    await db.ideas.update(id, { text: text.trim(), updatedAt: touch() });
  }

  export async function updateIdea(
    id: number,
    changes: {
      text?: string;
      links?: string[];
      subtasks?: Subtask[];
      due?: number | null;
      dueHasTime?: boolean;
    },
  ): Promise<void> {
    await db.ideas.update(id, {
      ...changes,
      ...(changes.text !== undefined ? { text: changes.text.trim() } : {}),
      updatedAt: touch(),
    });
  }

  export async function deleteIdea(id: number): Promise<void> {
    const now = touch();
    await db.ideas.update(id, { deletedAt: now, updatedAt: now });
  }

  export async function reorderIdeas(orderedIds: number[]): Promise<void> {
    const now = touch();
    await db.transaction("rw", db.ideas, async () => {
      await Promise.all(
        orderedIds.map((id, i) => db.ideas.update(id, { order: i, updatedAt: now })),
      );
    });
  }

  /** Promote an idea into a real task, carrying links/subtasks/due. */
  export async function promoteIdeaToTask(idea: Idea, bucket: Bucket): Promise<void> {
    await db.transaction("rw", db.tasks, db.ideas, async () => {
      await addTask({
        title: idea.text,
        links: idea.links ?? [],
        subtasks: idea.subtasks ?? [],
        projectId: idea.projectId,
        bucket,
        due: idea.due ?? null,
        dueHasTime: idea.dueHasTime ?? false,
      });
      await db.ideas.update(idea.id!, { status: "promoted", updatedAt: touch() });
    });
  }

  // ---------- Backlog (Histórico) ----------

  export async function addBacklog(title: string, note?: string): Promise<number> {
    const max = await maxOrder(db.backlog);
    const now = touch();
    return db.backlog.add({
      guid: newGuid(),
      title: title.trim(),
      note: note?.trim() || undefined,
      links: [],
      subtasks: [],
      order: max + 1,
      createdAt: now,
      updatedAt: now,
      due: null,
      dueHasTime: false,
      promotedProjectId: null,
      deletedAt: null,
    });
  }

  export async function listBacklog(): Promise<BacklogItem[]> {
    const rows = await db.backlog.orderBy("order").toArray();
    return rows.filter((b) => b.deletedAt == null);
  }

  export async function updateBacklog(
    id: number,
    changes: {
      title?: string;
      note?: string;
      links?: string[];
      subtasks?: Subtask[];
      due?: number | null;
      dueHasTime?: boolean;
    },
  ): Promise<void> {
    await db.backlog.update(id, {
      ...changes,
      ...(changes.title !== undefined ? { title: changes.title.trim() } : {}),
      updatedAt: touch(),
    });
  }

  export async function deleteBacklog(id: number): Promise<void> {
    const now = touch();
    await db.backlog.update(id, { deletedAt: now, updatedAt: now });
  }

  /** Promote a parked Histórico idea into a full project. */
  export async function promoteBacklogToProject(
    item: BacklogItem,
    kind: ProjectKind = "active",
  ): Promise<number> {
    let projectId = 0;
    const now = touch();
    await db.transaction("rw", db.projects, db.backlog, async () => {
      projectId = await addProject(item.title, kind);
      await db.backlog.update(item.id!, {
        promotedProjectId: projectId,
        deletedAt: now,
        updatedAt: now,
      });
    });
    return projectId;
  }

  // ---------- helpers ----------

  async function maxOrder<T extends { order: number }>(
    table: Table<T, number>,
  ): Promise<number> {
    const last = await table.orderBy("order").last();
    return last?.order ?? 0;
  }

  async function maxOrderWhere(
    table: Table<Idea, number>,
    index: "projectId",
    value: number,
  ): Promise<number> {
    const rows = await table.where(index).equals(value).toArray();
    return rows.reduce((m, r) => Math.max(m, r.order), 0);
  }

  async function maxTaskOrder(bucket: Bucket): Promise<number> {
    const rows = await db.tasks.where("bucket").equals(bucket).toArray();
    return rows.reduce((m, r) => Math.max(m, r.order), 0);
  }

  export type { Project };
  ```

  > Nota de diseño: `promoteBacklogToProject` ahora tombstonea el backlog item en vez de borrarlo físico (consistente con el resto). `toggleTask` se conserva como alias para no romper `task-list`/`task-row` hasta que se migren en Task 11.

- [ ] Verificar que pasa:
  ```bash
  pnpm test test/queries.test.ts
  ```
  Salida esperada: todos verdes (status cycle, blocked, tombstones ocultos, promote transfiere, defaults v2).

- [ ] Ejecutar la suite completa para confirmar que nada se rompió:
  ```bash
  pnpm test
  ```
  Salida esperada: todas las suites verdes.

- [ ] Commit:
  ```bash
  git add lib/db/queries.ts test/queries.test.ts
  git commit -m "feat: v2 queries — touch, status cycle, soft-delete, tombstone filters, content-transfer promote"
  ```

---

## Task 9: Rollover v2 — preservar estado, filtrar tombstones

**Files:**
- Modify: `lib/db/rollover.ts`
- Create: `test/rollover.test.ts`

- [ ] Crear `test/rollover.test.ts` (RED):
  ```ts
  import { beforeEach, describe, expect, it } from "vitest";
  import Dexie from "dexie";
  import { db, setMeta } from "@/lib/db/schema";
  import { addTask, deleteTask } from "@/lib/db/queries";
  import { runRollover } from "@/lib/db/rollover";
  import { localDateKey } from "@/lib/date";

  beforeEach(async () => {
    db.close();
    await Dexie.delete("cadence");
    await db.open();
  });

  describe("runRollover v2", () => {
    it("archives done today tasks and carries non-done ones, preserving status", async () => {
      const doneId = await addTask({ title: "done", bucket: "today" });
      const blockedId = await addTask({ title: "blocked", bucket: "today" });
      await db.tasks.update(doneId, { status: "done" });
      await db.tasks.update(blockedId, { status: "blocked" });
      // Force a previous opened-day so rollover runs.
      await setMeta("lastOpenedDay", "2000-01-01");

      const ran = await runRollover();
      expect(ran).toBe(true);

      const done = (await db.tasks.get(doneId))!;
      expect(done.archived).toBe(true);

      const blocked = (await db.tasks.get(blockedId))!;
      expect(blocked.status).toBe("blocked"); // preserved
      expect(blocked.carried).toBe(true);
    });

    it("promotes tomorrow tasks to today and ignores tombstoned rows", async () => {
      const tomorrowId = await addTask({ title: "tmrw", bucket: "tomorrow" });
      const goneId = await addTask({ title: "gone", bucket: "tomorrow" });
      await deleteTask(goneId);
      await setMeta("lastOpenedDay", "2000-01-01");

      await runRollover();

      expect((await db.tasks.get(tomorrowId))!.bucket).toBe("today");
      // Tombstoned row stays put (not silently revived).
      const gone = (await db.tasks.get(goneId))!;
      expect(gone.bucket).toBe("tomorrow");
      expect(gone.deletedAt).not.toBeNull();
    });

    it("is a no-op when already run today", async () => {
      await setMeta("lastOpenedDay", localDateKey());
      expect(await runRollover()).toBe(false);
    });
  });
  ```

- [ ] Verificar el fallo:
  ```bash
  pnpm test test/rollover.test.ts
  ```
  Salida esperada: falla (rollover actual no filtra tombstones ni sella `updatedAt`; el test de status preserved puede pasar ya, pero el de tombstones falla porque la query actual no filtra `deletedAt`).

- [ ] Reescribir `lib/db/rollover.ts`:
  ```ts
  import { db, getMeta, setMeta } from "@/lib/db/schema";
  import { localDateKey } from "@/lib/date";

  /**
   * Replays every day boundary crossed since the app was last opened:
   *  - done "today" tasks      -> archived (kept for History)
   *  - non-done "today" tasks  -> stay in Today, flagged `carried` (status kept)
   *  - "tomorrow" tasks         -> promoted to Today
   *  - "week" tasks             -> untouched
   *
   * Tombstoned rows (deletedAt != null) are ignored throughout.
   * Idempotent: a no-op when already run for the current local day.
   * Returns true if a rollover actually happened.
   */
  export async function runRollover(): Promise<boolean> {
    const today = localDateKey();
    const last = await getMeta<string | null>("lastOpenedDay", null);
    if (last === today) return false;

    await db.transaction("rw", db.tasks, db.meta, async () => {
      const now = Date.now();

      const todayTasks = await db.tasks
        .where("bucket")
        .equals("today")
        .filter((t) => !t.archived && t.deletedAt == null)
        .toArray();

      for (const t of todayTasks) {
        if (t.status === "done") {
          await db.tasks.update(t.id!, {
            archived: true,
            archivedAt: now,
            updatedAt: now,
          });
        } else if (!t.carried) {
          await db.tasks.update(t.id!, { carried: true, updatedAt: now });
        }
      }

      const tomorrow = await db.tasks
        .where("bucket")
        .equals("tomorrow")
        .filter((t) => !t.archived && t.deletedAt == null)
        .toArray();

      for (const t of tomorrow) {
        await db.tasks.update(t.id!, {
          bucket: "today",
          dayKey: today,
          updatedAt: now,
        });
      }

      await setMeta("lastOpenedDay", today);
    });

    return true;
  }
  ```

- [ ] Verificar que pasa:
  ```bash
  pnpm test test/rollover.test.ts
  ```
  Salida esperada: los 3 tests verdes.

- [ ] Commit:
  ```bash
  git add lib/db/rollover.ts test/rollover.test.ts
  git commit -m "feat: rollover preserves status, carried and skips tombstones"
  ```

---

## Task 10: Seed v2 + export JSON + Settings

**Files:**
- Modify: `lib/db/seed.ts`
- Create: `lib/export.ts`
- Create: `app/settings/page.tsx`
- Modify: `components/bottom-nav.tsx`
- Create: `test/export.test.ts`

El seed usa `addTask`/`addIdea`/`addBacklog`/`addProject` (ya v2 tras Task 8), así que **no requiere cambios de forma de fila** — solo verificar que sigue compilando. El foco es el export JSON (red de seguridad pre-migración del roadmap Tier 1.4).

- [ ] Confirmar que `lib/db/seed.ts` compila sin cambios (las firmas de `addTask` siguen aceptando `{ title, links, projectId, bucket }`; `time` ya no se pasa en el seed). Si algún `addTask` del seed pasaba `time`, eliminarlo. Revisar:
  ```bash
  grep -n "time:" lib/db/seed.ts
  ```
  Salida esperada: sin coincidencias (el seed actual no usa `time`). Si hubiera, quitarlas.

- [ ] Crear `test/export.test.ts` (RED):
  ```ts
  import { beforeEach, describe, expect, it } from "vitest";
  import Dexie from "dexie";
  import { db } from "@/lib/db/schema";
  import { addProject, addTask } from "@/lib/db/queries";
  import { exportSnapshot } from "@/lib/export";

  beforeEach(async () => {
    db.close();
    await Dexie.delete("cadence");
    await db.open();
  });

  describe("exportSnapshot", () => {
    it("includes every table and a version + timestamp", async () => {
      const pid = await addProject("HKN", "active");
      await addTask({ title: "task", projectId: pid, bucket: "today" });

      const snap = await exportSnapshot();
      expect(snap.version).toBe(2);
      expect(typeof snap.exportedAt).toBe("number");
      expect(snap.projects.length).toBe(1);
      expect(snap.tasks.length).toBe(1);
      expect(Array.isArray(snap.ideas)).toBe(true);
      expect(Array.isArray(snap.backlog)).toBe(true);
      expect(Array.isArray(snap.meta)).toBe(true);
    });

    it("includes tombstoned rows (full backup, not filtered)", async () => {
      const pid = await addProject("HKN", "active");
      const tid = await addTask({ title: "task", projectId: pid, bucket: "today" });
      await db.tasks.update(tid, { deletedAt: Date.now() });
      const snap = await exportSnapshot();
      expect(snap.tasks.length).toBe(1); // tombstone still backed up
    });
  });
  ```

- [ ] Verificar el fallo:
  ```bash
  pnpm test test/export.test.ts
  ```
  Salida esperada: módulo inexistente.

- [ ] Crear `lib/export.ts`:
  ```ts
  import { db } from "@/lib/db/schema";
  import type { BacklogItem, Idea, Project, Task } from "@/lib/types";

  export interface Snapshot {
    version: 2;
    exportedAt: number;
    projects: Project[];
    tasks: Task[];
    ideas: Idea[];
    backlog: BacklogItem[];
    meta: { key: string; value: unknown }[];
  }

  /** Full, unfiltered backup of every table (tombstones included). */
  export async function exportSnapshot(): Promise<Snapshot> {
    const [projects, tasks, ideas, backlog, meta] = await Promise.all([
      db.projects.toArray(),
      db.tasks.toArray(),
      db.ideas.toArray(),
      db.backlog.toArray(),
      db.meta.toArray(),
    ]);
    return {
      version: 2,
      exportedAt: Date.now(),
      projects,
      tasks,
      ideas,
      backlog,
      meta,
    };
  }

  /** Trigger a browser download of the snapshot as a JSON file. */
  export async function downloadSnapshot(): Promise<void> {
    const snap = await exportSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cadence-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  ```

- [ ] Verificar que pasa:
  ```bash
  pnpm test test/export.test.ts
  ```
  Salida esperada: ambos tests verdes.

- [ ] Crear `app/settings/page.tsx` (Settings mínimo; icono `Download`, nunca emoji):
  ```tsx
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
  ```

- [ ] Leer `components/bottom-nav.tsx` para conocer su estructura de items antes de editar:
  ```bash
  cat components/bottom-nav.tsx
  ```
  Salida esperada: una lista de entradas `{ href, label, icon }`. Añadir una entrada `{ href: "/settings", label: "Ajustes", icon: Settings }` (importando `Settings` de lucide-react) siguiendo el patrón exacto del archivo. Si el bottom-nav ya está lleno (4 items) y añadir un 5º rompe el layout, en su lugar añadir un enlace a Settings en el header de `app/page.tsx` junto al de History (icono `Settings`), y NO tocar el bottom-nav. El ejecutor decide según lo que vea, manteniendo el patrón existente — sin inventar componentes nuevos.

- [ ] Verificar build y suite completa:
  ```bash
  pnpm test && pnpm build
  ```
  Salida esperada: tests verdes; build de Next.js exitoso (`export` sin errores), `/settings` aparece como ruta estática generada.

- [ ] Commit:
  ```bash
  git add lib/export.ts app/settings/page.tsx components/bottom-nav.tsx app/page.tsx test/export.test.ts lib/db/seed.ts
  git commit -m "feat: JSON export snapshot + minimal Settings page"
  ```

---

## Task 11: UI — componentes de estado, chips y editores

Componentes reutilizables por task/idea/backlog. Sin tests automáticos (UI pura); verificación manual en Task 13.

**Files:**
- Create: `components/status-toggle.tsx`
- Create: `components/due-chip.tsx`
- Create: `components/checklist-chip.tsx`
- Create: `components/checklist-editor.tsx`
- Create: `components/due-picker.tsx`

- [ ] Crear `components/status-toggle.tsx`:
  ```tsx
  "use client";

  import { Ban, CheckCircle2, Circle, CircleDot } from "lucide-react";
  import type { TaskStatus } from "@/lib/types";
  import { cn } from "@/lib/utils";

  const ICON = {
    todo: Circle,
    in_progress: CircleDot,
    done: CheckCircle2,
    blocked: Ban,
  } as const;

  const LABEL: Record<TaskStatus, string> = {
    todo: "To do — tap to start",
    in_progress: "In progress — tap to complete",
    done: "Done — tap to reset",
    blocked: "Blocked — tap to reset",
  };

  export function StatusToggle({
    status,
    onCycle,
    className,
  }: {
    status: TaskStatus;
    onCycle: () => void;
    className?: string;
  }) {
    const Icon = ICON[status];
    return (
      <button
        type="button"
        aria-label={LABEL[status]}
        onClick={onCycle}
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full transition",
          status === "done" && "text-accent",
          status === "in_progress" && "text-primary",
          status === "blocked" && "text-amber-500",
          status === "todo" && "text-primary",
          className,
        )}
      >
        <Icon size={20} strokeWidth={status === "done" ? 2.5 : 2} />
      </button>
    );
  }
  ```

- [ ] Crear `components/due-chip.tsx`:
  ```tsx
  import { Clock } from "lucide-react";
  import { formatDue, isOverdue } from "@/lib/due";
  import { cn } from "@/lib/utils";

  export function DueChip({
    due,
    dueHasTime,
  }: {
    due?: number | null;
    dueHasTime?: boolean;
  }) {
    if (due == null) return null;
    const overdue = isOverdue(due);
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
          overdue ? "bg-danger/15 text-danger" : "bg-primary/15 text-foreground",
        )}
      >
        <Clock size={10} /> {formatDue(due, dueHasTime ?? false)}
      </span>
    );
  }
  ```

- [ ] Crear `components/checklist-chip.tsx`:
  ```tsx
  import { ListChecks } from "lucide-react";
  import type { Subtask } from "@/lib/types";

  export function ChecklistChip({ subtasks }: { subtasks: Subtask[] }) {
    if (!subtasks || subtasks.length === 0) return null;
    const done = subtasks.filter((s) => s.done).length;
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-border/60 px-1.5 py-0.5 text-[11px] font-medium text-muted">
        <ListChecks size={10} /> {done}/{subtasks.length}
      </span>
    );
  }
  ```

- [ ] Crear `components/checklist-editor.tsx`:
  ```tsx
  "use client";

  import { useState } from "react";
  import { Check, Plus, X } from "lucide-react";
  import type { Subtask } from "@/lib/types";
  import { newGuid } from "@/lib/id";
  import { cn } from "@/lib/utils";

  export function ChecklistEditor({
    subtasks,
    onChange,
  }: {
    subtasks: Subtask[];
    onChange: (next: Subtask[]) => void;
  }) {
    const [draft, setDraft] = useState("");
    const done = subtasks.filter((s) => s.done).length;

    function add() {
      const t = draft.trim();
      if (!t) return;
      onChange([...subtasks, { id: newGuid(), text: t, done: false }]);
      setDraft("");
    }

    function toggle(id: string) {
      onChange(subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
    }

    function remove(id: string) {
      onChange(subtasks.filter((s) => s.id !== id));
    }

    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[12px] font-medium text-muted">Checklist</p>
          {subtasks.length > 0 && (
            <span className="text-[11px] text-muted">
              {done}/{subtasks.length}
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-1">
          {subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <button
                type="button"
                aria-label={s.done ? "Mark not done" : "Mark done"}
                onClick={() => toggle(s.id)}
                className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition",
                  s.done
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-primary text-transparent",
                )}
              >
                <Check size={10} strokeWidth={3} />
              </button>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  s.done && "text-muted line-through",
                )}
              >
                {s.text}
              </span>
              <button
                type="button"
                aria-label="Remove item"
                onClick={() => remove(s.id)}
                className="text-muted transition hover:text-danger"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a step…"
            className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
          />
          <button
            type="button"
            aria-label="Add step"
            onClick={add}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted transition hover:text-foreground"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    );
  }
  ```

- [ ] Crear `components/due-picker.tsx`:
  ```tsx
  "use client";

  import { CalendarDays } from "lucide-react";
  import { dueToInputs, inputsToDue } from "@/lib/due";

  export function DuePicker({
    due,
    dueHasTime,
    onChange,
  }: {
    due?: number | null;
    dueHasTime?: boolean;
    onChange: (next: { due: number | null; dueHasTime: boolean }) => void;
  }) {
    const { date, time } = due != null
      ? dueToInputs(due, dueHasTime ?? false)
      : { date: "", time: "" };

    return (
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-muted">Due</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] text-muted">
            <CalendarDays size={12} />
            <input
              type="date"
              value={date}
              onChange={(e) => onChange(inputsToDue(e.target.value, time))}
              aria-label="Due date"
              className="bg-transparent text-foreground outline-none"
            />
          </label>
          <input
            type="time"
            value={time}
            disabled={!date}
            onChange={(e) => onChange(inputsToDue(date, e.target.value))}
            aria-label="Due time"
            className="rounded-full border border-border bg-transparent px-2.5 py-1 text-[12px] text-foreground outline-none disabled:opacity-40"
          />
          {date && (
            <button
              type="button"
              onClick={() => onChange({ due: null, dueHasTime: false })}
              className="text-[12px] text-muted transition hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] Verificar que compila (no hay test, pero el build los typechequea cuando se importen; de momento solo TS):
  ```bash
  pnpm exec tsc --noEmit 2>&1 | grep -E "status-toggle|due-chip|checklist|due-picker" || echo "OK no errors in new components"
  ```
  Salida esperada: `OK no errors in new components` (los archivos compilan; los warnings de otros archivos aún sin migrar se resuelven en Task 12).

- [ ] Commit:
  ```bash
  git add components/status-toggle.tsx components/due-chip.tsx components/checklist-chip.tsx components/checklist-editor.tsx components/due-picker.tsx
  git commit -m "feat: status toggle, due/checklist chips, checklist + due editors"
  ```

---

## Task 12: Cablear UI — task-row, idea-row, historico, quick-add, page, task-list

**Files:**
- Modify: `components/task-row.tsx`
- Modify: `components/idea-row.tsx`
- Modify: `app/historico/page.tsx`
- Modify: `components/quick-add.tsx`
- Modify: `app/page.tsx`
- Modify: `components/task-list.tsx`

- [ ] Reescribir `components/task-row.tsx` para usar `StatusToggle`, chips de preview en orden fijo `[due][checklist][links]` (fotos en SP2, déjalo previsto con un comentario) y un sheet expandido completo. Reemplazar el archivo entero por:
  ```tsx
  "use client";

  import { useState, type ReactNode } from "react";
  import { useLiveQuery } from "dexie-react-hooks";
  import { Trash2 } from "lucide-react";
  import { db } from "@/lib/db/schema";
  import type { Project, Subtask, Task, TaskStatus } from "@/lib/types";
  import { BUCKETS } from "@/lib/types";
  import { cn } from "@/lib/utils";
  import { firstLines } from "@/lib/multiline";
  import { ProjectTag } from "./project-tag";
  import { LinkChip } from "./link-chip";
  import { DueChip } from "./due-chip";
  import { ChecklistChip } from "./checklist-chip";
  import { StatusToggle } from "./status-toggle";
  import { ChecklistEditor } from "./checklist-editor";
  import { DuePicker } from "./due-picker";
  import { Sheet, SheetContent } from "./ui/sheet";
  import { Button } from "./ui/button";
  import {
    cycleTaskStatus,
    deleteTask,
    moveTask,
    setTaskStatus,
    updateTask,
  } from "@/lib/db/queries";
  import { extractLinks } from "@/lib/links";

  const STATUSES: { id: TaskStatus; label: string }[] = [
    { id: "todo", label: "To do" },
    { id: "in_progress", label: "In progress" },
    { id: "blocked", label: "Blocked" },
    { id: "done", label: "Done" },
  ];

  export function TaskRow({
    task,
    project,
    handle,
  }: {
    task: Task;
    project?: Project;
    handle?: ReactNode;
  }) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState(task.title);
    const [projectId, setProjectId] = useState<number | null>(task.projectId ?? null);
    const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks ?? []);
    const [due, setDue] = useState<number | null>(task.due ?? null);
    const [dueHasTime, setDueHasTime] = useState<boolean>(task.dueHasTime ?? false);
    const done = task.status === "done";
    const [isNew] = useState(() => Date.now() - task.createdAt < 1500);

    const projects = useLiveQuery(
      () => (open ? db.projects.orderBy("order").toArray() : []),
      [open],
    );

    function openSheet() {
      setTitle(task.title);
      setProjectId(task.projectId ?? null);
      setSubtasks(task.subtasks ?? []);
      setDue(task.due ?? null);
      setDueHasTime(task.dueHasTime ?? false);
      setOpen(true);
    }

    function save() {
      const { title: cleanTitle, links } = extractLinks(title);
      const t = cleanTitle.trim() || title.trim();
      if (!t) return;
      void updateTask(task.id!, {
        title: t,
        projectId,
        links: links.length ? [...task.links, ...links] : task.links,
        subtasks,
        due,
        dueHasTime,
      });
      setOpen(false);
    }

    const hasPreview =
      task.due != null ||
      (task.subtasks?.length ?? 0) > 0 ||
      task.links.length > 0 ||
      !!project ||
      (task.carried && !done);

    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5",
          isNew && "row-arrive",
        )}
      >
        <StatusToggle status={task.status} onCycle={() => void cycleTaskStatus(task)} />

        <button onClick={openSheet} className="min-w-0 flex-1 text-left">
          <span
            className={cn(
              "block whitespace-pre-line text-[15px] leading-snug line-clamp-2",
              done ? "text-muted line-through" : "text-foreground",
            )}
          >
            {firstLines(task.title, 2)}
          </span>
          {hasPreview && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {/* Fixed order: [due][checklist][links][photos(SP2)] */}
              <DueChip due={task.due} dueHasTime={task.dueHasTime} />
              <ChecklistChip subtasks={task.subtasks ?? []} />
              {task.links.map((l) => (
                <LinkChip key={l} url={l} />
              ))}
              {/* TODO(SP2): photo chip goes here, after links. */}
              {project && <ProjectTag name={project.name} color={project.color} />}
              {task.carried && !done && (
                <span className="inline-flex items-center gap-1 rounded-md bg-border/60 px-1.5 py-0.5 text-[11px] text-muted">
                  carried
                </span>
              )}
            </span>
          )}
        </button>

        {handle}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent title="Edit task">
            <p className="mb-1.5 text-[12px] font-medium text-muted">Status</p>
            <div className="mb-4 grid grid-cols-4 gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void setTaskStatus(task.id!, s.id)}
                  className={cn(
                    "rounded-full px-2 py-1.5 text-[11px] font-medium transition",
                    task.status === s.id
                      ? "bg-primary text-primary-ink"
                      : "border border-border text-muted",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-[15px] outline-none focus:border-primary"
            />

            <div className="mt-4">
              <DuePicker
                due={due}
                dueHasTime={dueHasTime}
                onChange={(n) => {
                  setDue(n.due);
                  setDueHasTime(n.dueHasTime);
                }}
              />
            </div>

            <div className="mt-4">
              <ChecklistEditor subtasks={subtasks} onChange={setSubtasks} />
            </div>

            {task.links.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-[12px] font-medium text-muted">Links</p>
                <div className="flex flex-wrap gap-1.5">
                  {task.links.map((l) => (
                    <LinkChip key={l} url={l} />
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 mb-1.5 text-[12px] font-medium text-muted">Project</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setProjectId(null)}
                className={cn(
                  "rounded-full px-2.5 py-1.5 text-[12px] font-medium transition",
                  projectId === null
                    ? "bg-primary text-primary-ink"
                    : "border border-border text-muted",
                )}
              >
                None
              </button>
              {projects?.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProjectId(p.id!)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition",
                    projectId === p.id
                      ? "bg-primary text-primary-ink"
                      : "border border-border text-muted",
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: p.color }}
                  />
                  {p.name}
                </button>
              ))}
            </div>

            <p className="mt-4 mb-1.5 text-[12px] font-medium text-muted">Move to</p>
            <div className="grid grid-cols-3 gap-2">
              {BUCKETS.map((b) => (
                <Button
                  key={b.id}
                  variant={task.bucket === b.id ? "primary" : "soft"}
                  size="sm"
                  onClick={() => {
                    moveTask(task.id!, b.id);
                    setOpen(false);
                  }}
                >
                  {b.label}
                </Button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  deleteTask(task.id!);
                  setOpen(false);
                }}
              >
                <Trash2 size={15} /> Delete
              </Button>
              <Button size="sm" onClick={save} disabled={!title.trim()}>
                Save
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }
  ```

- [ ] Actualizar `components/task-list.tsx`: la línea 38 usa `t.time` para decidir si el row arrastra. Cambiar a `t.dueHasTime` (las tasks con hora se ordenan por due, no arrastran):
  - Reemplazar `t.time ? undefined : (` por `t.dueHasTime ? undefined : (`.
  - Actualizar el comentario de la línea 37 a `// Tasks with a timed due sort by time; only the rest drag.`

- [ ] Actualizar `app/page.tsx`: el sort usa `task.time`. Reemplazar el comparador (líneas 44-54) por uno basado en `due`:
  - Reemplazar el bloque del comparador por:
    ```tsx
    // Non-done before done; tasks with a due sort earliest-first, the rest keep manual order.
    const dueCmp = (a?: number | null, b?: number | null) =>
      a != null && b != null ? a - b : Number(b != null) - Number(a != null);
    const sorted = tasks
      .slice()
      .sort(
        (a, b) =>
          Number(a.status === "done") - Number(b.status === "done") ||
          dueCmp(a.due, b.due) ||
          a.order - b.order,
      );
    ```
  - Actualizar el `useLiveQuery` de `tasks` y `counts` para filtrar tombstones: añadir `&& t.deletedAt == null` a los filtros `.filter((t) => !t.archived)` (líneas 28 y 32). El conteo de `today` usa `t.status === "open"`; cambiarlo a `t.status !== "done"` (en v2 ya no existe `"open"`).

- [ ] Reescribir `components/idea-row.tsx` para sheet expandido simétrico (texto multilínea, due, checklist, links) y chips de preview. Reemplazar el archivo entero por:
  ```tsx
  "use client";

  import { useState, type ReactNode } from "react";
  import { ArrowUpRight, Trash2 } from "lucide-react";
  import type { Idea, Subtask } from "@/lib/types";
  import { BUCKETS } from "@/lib/types";
  import {
    deleteIdea,
    promoteIdeaToTask,
    updateIdea,
  } from "@/lib/db/queries";
  import { extractLinks } from "@/lib/links";
  import { firstLines } from "@/lib/multiline";
  import { Sheet, SheetContent } from "./ui/sheet";
  import { Button } from "./ui/button";
  import { LinkChip } from "./link-chip";
  import { DueChip } from "./due-chip";
  import { ChecklistChip } from "./checklist-chip";
  import { ChecklistEditor } from "./checklist-editor";
  import { DuePicker } from "./due-picker";
  import { cn } from "@/lib/utils";

  export function IdeaRow({ idea, handle }: { idea: Idea; handle?: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(idea.text);
    const [subtasks, setSubtasks] = useState<Subtask[]>(idea.subtasks ?? []);
    const [due, setDue] = useState<number | null>(idea.due ?? null);
    const [dueHasTime, setDueHasTime] = useState<boolean>(idea.dueHasTime ?? false);
    const [isNew] = useState(() => Date.now() - idea.createdAt < 1500);

    function openSheet() {
      setText(idea.text);
      setSubtasks(idea.subtasks ?? []);
      setDue(idea.due ?? null);
      setDueHasTime(idea.dueHasTime ?? false);
      setOpen(true);
    }

    function save() {
      const { title: cleanText, links } = extractLinks(text);
      const t = cleanText.trim() || text.trim();
      if (!t) return;
      void updateIdea(idea.id!, {
        text: t,
        links: links.length ? [...(idea.links ?? []), ...links] : idea.links,
        subtasks,
        due,
        dueHasTime,
      });
      setOpen(false);
    }

    const hasPreview =
      idea.due != null ||
      (idea.subtasks?.length ?? 0) > 0 ||
      (idea.links?.length ?? 0) > 0;

    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5",
          isNew && "row-arrive",
        )}
      >
        <button onClick={openSheet} className="min-w-0 flex-1 text-left">
          <p className="whitespace-pre-line text-[14px] leading-snug text-foreground line-clamp-2">
            {firstLines(idea.text, 2)}
          </p>
          {hasPreview && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <DueChip due={idea.due} dueHasTime={idea.dueHasTime} />
              <ChecklistChip subtasks={idea.subtasks ?? []} />
              {(idea.links ?? []).map((l) => (
                <LinkChip key={l} url={l} />
              ))}
            </span>
          )}
        </button>
        <button
          onClick={openSheet}
          aria-label="Promote to task"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-border/50 hover:text-foreground"
        >
          <ArrowUpRight size={16} />
        </button>
        <button
          onClick={() => deleteIdea(idea.id!)}
          aria-label="Delete idea"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:text-danger"
        >
          <Trash2 size={15} />
        </button>

        {handle}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent title="Edit idea">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-[14px] outline-none focus:border-primary"
            />

            <div className="mt-4">
              <DuePicker
                due={due}
                dueHasTime={dueHasTime}
                onChange={(n) => {
                  setDue(n.due);
                  setDueHasTime(n.dueHasTime);
                }}
              />
            </div>

            <div className="mt-4">
              <ChecklistEditor subtasks={subtasks} onChange={setSubtasks} />
            </div>

            {(idea.links?.length ?? 0) > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-[12px] font-medium text-muted">Links</p>
                <div className="flex flex-wrap gap-1.5">
                  {(idea.links ?? []).map((l) => (
                    <LinkChip key={l} url={l} />
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 mb-1.5 text-[12px] font-medium text-muted">
              Promote to
            </p>
            <div className="grid grid-cols-3 gap-2">
              {BUCKETS.map((b) => (
                <Button
                  key={b.id}
                  variant="soft"
                  size="sm"
                  onClick={() => {
                    // Persist edits first so promote transfers them.
                    save();
                    void promoteIdeaToTask({ ...idea, text, links: idea.links, subtasks, due, dueHasTime }, b.id);
                    setOpen(false);
                  }}
                >
                  {b.label}
                </Button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  deleteIdea(idea.id!);
                  setOpen(false);
                }}
              >
                <Trash2 size={15} /> Delete
              </Button>
              <Button size="sm" onClick={save} disabled={!text.trim()}>
                Save
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }
  ```

  > Nota: el botón "Promote to" persiste primero (`save()`) y luego promueve con el snapshot de estado actual, garantizando que links/checklist/due editados se transfieran aunque el usuario no haya pulsado Save antes.

- [ ] Reescribir `app/historico/page.tsx` para abrir un sheet expandido al tocar un backlog item (texto multilínea, due, checklist, links, promover, borrar). Sustituir la fila estática actual por una que abra un `Sheet`. Reemplazar el archivo entero por:
  ```tsx
  "use client";

  import { useState } from "react";
  import { useRouter } from "next/navigation";
  import { useLiveQuery } from "dexie-react-hooks";
  import { ArrowUpRight, Plus, Sparkles, Trash2 } from "lucide-react";
  import { db } from "@/lib/db/schema";
  import {
    addBacklog,
    deleteBacklog,
    promoteBacklogToProject,
    updateBacklog,
  } from "@/lib/db/queries";
  import { Empty } from "@/components/empty";
  import { Input } from "@/components/ui/input";
  import { Button } from "@/components/ui/button";
  import { Sheet, SheetContent } from "@/components/ui/sheet";
  import { DueChip } from "@/components/due-chip";
  import { ChecklistChip } from "@/components/checklist-chip";
  import { ChecklistEditor } from "@/components/checklist-editor";
  import { DuePicker } from "@/components/due-picker";
  import { LinkChip } from "@/components/link-chip";
  import { extractLinks } from "@/lib/links";
  import { firstLines } from "@/lib/multiline";
  import { cn } from "@/lib/utils";
  import type { BacklogItem, Subtask } from "@/lib/types";

  export default function HistoricoPage() {
    const router = useRouter();
    const items = useLiveQuery(
      async () =>
        (await db.backlog.orderBy("order").toArray()).filter(
          (b) => b.deletedAt == null,
        ),
      [],
      [],
    );
    const [text, setText] = useState("");
    const [loadedAt] = useState(() => Date.now());

    const [editing, setEditing] = useState<BacklogItem | null>(null);
    const [eTitle, setETitle] = useState("");
    const [eSubtasks, setESubtasks] = useState<Subtask[]>([]);
    const [eDue, setEDue] = useState<number | null>(null);
    const [eDueHasTime, setEDueHasTime] = useState(false);

    async function submit() {
      if (!text.trim()) return;
      await addBacklog(text);
      setText("");
    }

    function openSheet(item: BacklogItem) {
      setEditing(item);
      setETitle(item.title);
      setESubtasks(item.subtasks ?? []);
      setEDue(item.due ?? null);
      setEDueHasTime(item.dueHasTime ?? false);
    }

    function save() {
      if (!editing) return;
      const { title: clean, links } = extractLinks(eTitle);
      const t = clean.trim() || eTitle.trim();
      if (!t) return;
      void updateBacklog(editing.id!, {
        title: t,
        links: links.length ? [...(editing.links ?? []), ...links] : editing.links,
        subtasks: eSubtasks,
        due: eDue,
        dueHasTime: eDueHasTime,
      });
      setEditing(null);
    }

    async function promote(item: BacklogItem) {
      const id = await promoteBacklogToProject(item);
      router.push(`/projects?p=${id}`);
    }

    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-10">
        <h1 className="font-display text-xl font-bold">Histórico</h1>
        <p className="mb-4 mt-1 text-[13px] text-muted">
          Future project ideas parked so you don’t forget. Promote one into a real
          project when you’re ready.
        </p>

        <div className="mb-4 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Park a future idea…"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <Button
            size="icon"
            onClick={() => void submit()}
            disabled={!text.trim()}
            aria-label="Add to histórico"
          >
            <Plus size={20} />
          </Button>
        </div>

        {items.length === 0 ? (
          <Empty
            icon={<Sparkles size={28} />}
            title="Nothing parked"
            hint="Capture ideas for future projects here."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((it) => (
              <div
                key={it.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5",
                  it.createdAt > loadedAt - 1500 && "row-arrive",
                )}
              >
                <button
                  onClick={() => openSheet(it)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="whitespace-pre-line text-[14px] leading-snug line-clamp-2">
                    {firstLines(it.title, 2)}
                  </p>
                  {(it.due != null ||
                    (it.subtasks?.length ?? 0) > 0 ||
                    (it.links?.length ?? 0) > 0) && (
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <DueChip due={it.due} dueHasTime={it.dueHasTime} />
                      <ChecklistChip subtasks={it.subtasks ?? []} />
                      {(it.links ?? []).map((l) => (
                        <LinkChip key={l} url={l} />
                      ))}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => void promote(it)}
                  aria-label="Promote to project"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-border/50 hover:text-foreground"
                >
                  <ArrowUpRight size={16} />
                </button>
                <button
                  onClick={() => deleteBacklog(it.id!)}
                  aria-label="Delete"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <Sheet open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
          <SheetContent title="Edit parked idea">
            <textarea
              value={eTitle}
              onChange={(e) => setETitle(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-[14px] outline-none focus:border-primary"
            />
            <div className="mt-4">
              <DuePicker
                due={eDue}
                dueHasTime={eDueHasTime}
                onChange={(n) => {
                  setEDue(n.due);
                  setEDueHasTime(n.dueHasTime);
                }}
              />
            </div>
            <div className="mt-4">
              <ChecklistEditor subtasks={eSubtasks} onChange={setESubtasks} />
            </div>
            <div className="mt-5 flex items-center justify-between">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (editing) deleteBacklog(editing.id!);
                  setEditing(null);
                }}
              >
                <Trash2 size={15} /> Delete
              </Button>
              <Button size="sm" onClick={save} disabled={!eTitle.trim()}>
                Save
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }
  ```

- [ ] Reescribir `components/quick-add.tsx`: reemplazar el `Input` por un `textarea` multilínea (Shift+Enter inserta salto, Enter envía en desktop; en móvil un botón "expandir" con icono `Maximize2` agranda el textarea), y reemplazar el campo `time` por `DuePicker`. Reemplazar el archivo entero por:
  ```tsx
  "use client";

  import { useState } from "react";
  import { Maximize2, Minimize2, Plus } from "lucide-react";
  import { useLiveQuery } from "dexie-react-hooks";
  import { db } from "@/lib/db/schema";
  import { addTask } from "@/lib/db/queries";
  import { extractLinks } from "@/lib/links";
  import { BUCKETS, type Bucket } from "@/lib/types";
  import { Sheet, SheetContent } from "./ui/sheet";
  import { Button } from "./ui/button";
  import { DuePicker } from "./due-picker";
  import { cn } from "@/lib/utils";

  export function QuickAdd({
    defaultBucket = "today",
    defaultProjectId = null,
  }: {
    defaultBucket?: Bucket;
    defaultProjectId?: number | null;
  }) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [bucket, setBucket] = useState<Bucket>(defaultBucket);
    const [projectId, setProjectId] = useState<number | null>(defaultProjectId);
    const [due, setDue] = useState<number | null>(null);
    const [dueHasTime, setDueHasTime] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const projects = useLiveQuery(
      () => db.projects.orderBy("order").toArray(),
      [],
      [],
    );

    function openSheet() {
      setBucket(defaultBucket);
      setProjectId(defaultProjectId);
      setText("");
      setDue(null);
      setDueHasTime(false);
      setExpanded(false);
      setOpen(true);
    }

    async function submit() {
      const { title, links } = extractLinks(text);
      const finalTitle = title.trim() || text.trim();
      if (!finalTitle) return;
      await addTask({ title: finalTitle, links, projectId, bucket, due, dueHasTime });
      setOpen(false);
    }

    return (
      <>
        <button
          onClick={openSheet}
          aria-label="Add task"
          className="fixed bottom-24 right-[max(1rem,calc(50%-13rem))] z-30 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-ink shadow-lg shadow-primary/40 transition active:scale-95 md:bottom-8 md:right-[max(2rem,calc(50%-22.5rem))] xl:right-[calc(50%-30.5rem)]"
        >
          <Plus size={26} />
        </button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent title="Add a task">
            <div className="relative">
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What needs doing? Paste links too…"
                rows={expanded ? 6 : 2}
                onKeyDown={(e) => {
                  // Enter submits; Shift+Enter inserts a newline (desktop).
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 pr-9 text-[15px] outline-none focus:border-primary"
              />
              <button
                type="button"
                aria-label={expanded ? "Collapse" : "Expand"}
                onClick={() => setExpanded((v) => !v)}
                className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-muted transition hover:text-foreground"
              >
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>

            <div className="mt-3 flex gap-1.5">
              {BUCKETS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBucket(b.id)}
                  className={cn(
                    "flex-1 rounded-full px-2 py-1.5 text-[12px] font-medium transition",
                    bucket === b.id
                      ? "bg-primary text-primary-ink"
                      : "border border-border text-muted",
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                onClick={() => setProjectId(null)}
                className={cn(
                  "rounded-full border border-border px-2.5 py-1 text-[12px] transition",
                  projectId === null ? "text-foreground" : "text-muted",
                )}
              >
                No project
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProjectId(p.id!)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] transition",
                    projectId === p.id ? "text-foreground" : "text-muted",
                  )}
                  style={
                    projectId === p.id
                      ? { borderColor: p.color, background: `${p.color}22` }
                      : undefined
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: p.color }}
                  />
                  {p.name}
                </button>
              ))}
            </div>

            <div className="mt-3">
              <DuePicker
                due={due}
                dueHasTime={dueHasTime}
                onChange={(n) => {
                  setDue(n.due);
                  setDueHasTime(n.dueHasTime);
                }}
              />
            </div>

            <Button
              className="mt-5 w-full"
              onClick={() => void submit()}
              disabled={!text.trim()}
            >
              Add task
            </Button>
          </SheetContent>
        </Sheet>
      </>
    );
  }
  ```

- [ ] Verificar typecheck completo, lint y build:
  ```bash
  pnpm exec tsc --noEmit && pnpm lint && pnpm build
  ```
  Salida esperada: sin errores de TypeScript, lint limpio, build de export exitoso. Si quedan referencias a `task.time`/`formatTime`/`status === "open"` en otros componentes (p.ej. `project-detail.tsx`), corregirlas siguiendo el mismo patrón (`due`/`dueHasTime`, `status !== "done"`).

- [ ] Ejecutar la suite de tests para confirmar que la capa de datos sigue verde:
  ```bash
  pnpm test
  ```
  Salida esperada: todas las suites verdes.

- [ ] Commit:
  ```bash
  git add components/task-row.tsx components/idea-row.tsx components/quick-add.tsx components/task-list.tsx app/page.tsx app/historico/page.tsx
  git commit -m "feat: wire v2 UI — status toggle, expanded sheets, due/checklist/links chips, multiline quick-add"
  ```

---

## Task 13: Verificación manual end-to-end + migración real

UI pura no cubierta por tests automáticos; verificación con `pnpm dev` y un dispositivo/navegador con datos v1.

**Files:** ninguno (solo verificación).

- [ ] Arrancar el dev server:
  ```bash
  pnpm dev
  ```
  Abrir http://localhost:3000.

- [ ] **Migración sin pérdida (lo más crítico):** Antes de actualizar, si hay un navegador con datos v1 reales, abre `/settings` (o el enlace nuevo) tras cargar la app y pulsa **Export JSON**; guarda el archivo. Luego recarga para que corra la migración Dexie v2. Vuelve a exportar y compara: el número de tasks/ideas/projects/backlog debe coincidir; las tasks que tenían hora deben mostrar un chip de due (`Clock`), y ninguna debe haber perdido su título/links. Esperado: conteos idénticos, `time` convertido a `due`.

- [ ] **Estados con tap:** En Today, toca el indicador de una task repetidamente. Esperado: `Circle` (todo) → `CircleDot` (in_progress) → `CheckCircle2` verde (done, tachado) → vuelve a `Circle`. La task done se archiva al pasar el día (rollover).

- [ ] **Blocked desde el sheet:** Abre una task, en el selector de estado pulsa "Blocked". Esperado: el indicador en la fila muestra `Ban` en ámbar. Un tap en el indicador la devuelve a `todo`.

- [ ] **Sheet expandido:** Abre una task. Esperado: selector de estado (4 chips), textarea multilínea, due picker (date + time), checklist editor (añade un paso, márcalo, ve el progreso `1/1`), chips de links si los hay, selector de proyecto, mover bucket, borrar. Pulsa Save y verifica que los cambios persisten al reabrir.

- [ ] **Título multilínea:** En quick-add pulsa el botón expandir (`Maximize2`), escribe dos líneas con Shift+Enter, añade. Esperado: la fila muestra ~2 líneas con ellipsis si excede; el sheet muestra el texto completo.

- [ ] **Chips orden fijo `[due][checklist][links]`:** Crea una task con due, un checklist de 1/3 y un link. Esperado en preview: primero el chip de due (`Clock`), luego `1/3`, luego el link. Due vencida (fecha pasada) se muestra en rojo.

- [ ] **Links en ideas y backlog:** En una idea (dentro de un proyecto) y en un backlog item de Histórico, pega un link en el texto y guarda. Esperado: aparece como `LinkChip` en el preview, igual que en tasks.

- [ ] **Promover idea con contenido:** Crea una idea, añádele un link, un checklist y un due en su sheet. Pulsa "Promote to → Today". Esperado: la nueva task en Today conserva el link, el checklist y el due; la idea queda marcada como promovida (desaparece de la lista de ideas abiertas).

- [ ] **Tombstones / borrado:** Borra una task. Esperado: desaparece de la lista inmediatamente (filtrada por `deletedAt`), y no reaparece tras recargar ni tras el rollover.

- [ ] **Export final:** En `/settings`, pulsa Export JSON. Esperado: descarga `cadence-backup-YYYY-MM-DD.json` con todas las tablas, incluyendo filas tombstoneadas (backup completo).

- [ ] Detener el dev server (Ctrl+C). No se requiere commit (solo verificación). Si algún paso falló, volver al Task correspondiente, corregir con TDD donde aplique, y re-commit antes de cerrar SP1.

---

## Auto-review (cobertura del spec SP1)

- Migración Dexie v1→v2 in-place sin pérdida — Tasks 4, 5 (tests de conteos, `open→todo`, `time→due`, guids únicos).
- Export JSON completo en Settings mínimo, antes de la migración en el orden del plan — Task 10 (`exportSnapshot` precede a la verificación de migración en Task 13). El módulo de export se construye después de la migración porque depende de tipos v2, pero la **acción de exportar** está disponible para el usuario antes de recargar/migrar en producción.
- Estados con tap (`todo→in_progress→done`), iconos `Circle`/`CircleDot`/`CheckCircle2`, `Ban` ámbar = blocked solo desde sheet — Tasks 8, 11, 12.
- Sheet expandido (estado, título multilínea, checklist con progreso, chips links, due picker, mover/promover/borrar) — Task 12.
- Chips preview orden `[due][checklist][links][fotos]` (fotos previsto con TODO SP2) — Tasks 11, 12.
- Due formato relativo corto + rojo overdue — Tasks 6, 11.
- Links en ideas/backlog con `extractLinks`/`linkLabel`/`LinkChip` — Task 12.
- Quick-add multilínea (Shift+Enter desktop, botón expandir móvil) — Task 12.
- Promover idea→task transfiere links/checklist/due — Tasks 8, 12 (test verde en queries).
- Rollover preserva estado y `carried`, filtra tombstones — Task 9.
- Tombstones con queries filtradas (`deletedAt == null`) — Tasks 8, 9, 12.
- Setup vitest + fake-indexeddb como primera tarea, TDD real en capa de datos — Tasks 1–9.

Cero placeholders: todos los pasos llevan código completo y comandos con salida esperada. Tipos consistentes con el contrato verbatim del prompt.
