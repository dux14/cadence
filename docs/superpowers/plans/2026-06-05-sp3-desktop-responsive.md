# Plan de implementación — SP3: Desktop responsive (Cadence v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan. Read the whole plan first, then implement task by task. Each task ends with a commit. Stop at the verification checkpoints. No task is "done" until its verification command prints the expected output.

- **Fecha:** 2026-06-05
- **Sub-proyecto:** SP3 del spec `docs/superpowers/specs/2026-06-05-cadence-v2-design.md` (sección SP3, líneas 66–73)
- **Prerrequisito:** SP1 entregado (y normalmente SP2). De SP1 se asume: migración Dexie v2, `Task.status: "todo" | "in_progress" | "blocked" | "done"`, `Task.due?: number | null` + `Task.dueHasTime: boolean`, `Task.guid`/`updatedAt`, sheet expandido (Radix Dialog) con selector de estado e iconos lucide, chips `[due] [checklist] [links] [fotos]`, y **vitest configurado** (`vitest.config.ts` + script `test`). Este plan verifica esos prerrequisitos en la Tarea 0 y falla rápido si no existen.

---

## Goal

Hacer Cadence usable y agradable en pantallas grandes **sin tocar el layout móvil** (`<768px` queda idéntico, Lighthouse mobile ≥90 se mantiene). En desktop: sidebar de navegación, los tres buckets (Today / Tomorrow / This Week) como columnas lado a lado con quick-add propio, drag 2D (reorder vertical dentro de columna + transferir task a otra columna), grid de proyectos a 3–4 columnas, detalle de proyecto en dos columnas, y el sheet convertido en modal centrado. Atajos de teclado mínimos: `N`, `Esc`, `Enter`.

## Architecture

Decisiones estructurales (para evitar regresión móvil y mantener el static export limpio):

1. **Doble render, no media-query en JS.** La vista de Today renderiza **dos árboles**: el móvil actual (`Segmented` + una `TaskList` + un `QuickAdd`) envuelto en `md:hidden`, y un **nuevo** `DesktopBoard` (3 columnas) envuelto en `hidden md:flex`. Así no hay flash de hidratación ni `window.matchMedia` en el render, y el HTML estático sirve ambos. El CSS decide cuál se ve. El árbol móvil **no se modifica**.
2. **Sidebar = evolución de `BottomNav`.** `bottom-nav.tsx` ya es una barra inferior en móvil y un rail lateral desde `md`. Se reestructura para: ocultarse del todo `<768px`? No — el spec dice "bottom-nav se oculta ≥768px", así que móvil mantiene la barra inferior y desde `md` se muestra el sidebar. Se añade el 4º item (History) y el theme toggle al fondo del sidebar. La barra inferior móvil sigue con 3 items (sin History, que ya está accesible desde el header de Today).
3. **Drag 2D** extiende `use-drag-reorder` con un callback opcional `onTransfer(id, toBucket)`. La detección de columna destino usa `document.elementFromPoint(x, y)` buscando el ancestro con `[data-bucket]`. La lógica pura (resolver bucket destino desde un punto, y el reducer reorder/transfer) se extrae a `lib/drag-board.ts` y se testea con vitest (TDD). El hook solo orquesta DOM + commit.
4. **Sheet → modal** con una variante por CSS responsivo en el mismo `SheetContent` (mismo Radix Dialog): móvil = bottom sheet (actual), `≥md` = modal centrado `max-w-[560px]`.
5. **Breakpoints Tailwind 4** (defaults, todos existen): `md` = 768px (tablet: sidebar de iconos + columna ancha), `lg` = 1024px (desktop completo: 3 columnas), `xl` = 1280px. Tailwind 4 mantiene estos breakpoints por defecto; no se redefine ninguno en `globals.css` (config CSS-first solo tiene `@theme inline` de colores/fuentes, sin `--breakpoint-*`).

## Tech Stack

- Next.js 16.2.6, `output: "export"` (static), build con `next build --webpack`.
- React 19.2, TypeScript 5, Tailwind CSS 4 (CSS-first en `app/globals.css`).
- `lucide-react ^1.17.0` (iconos siempre; **nunca emojis**).
- `@radix-ui/react-dialog` (sheet/modal).
- Dexie 4 + `dexie-react-hooks` (datos locales reactivos).
- vitest (asumido configurado por SP1) para la lógica extraíble.
- pnpm para todo (`pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`).

## File Structure

```
lib/
  drag-board.ts            (CREATE) lógica pura: resolveBucketAt + boardReducer
  drag-board.test.ts       (CREATE) tests vitest TDD
  use-drag-reorder.ts      (MODIFY) extensión 2D: onTransfer + columnSelector
components/
  bottom-nav.tsx           (MODIFY) sidebar desktop (4 items + theme toggle), barra inferior móvil intacta
  desktop-board.tsx        (CREATE) 3 columnas con header/contador/quick-add/drag
  board-column.tsx         (CREATE) una columna (data-bucket, lista draggable)
  task-list.tsx            (MODIFY) acepta props opcionales de transferencia 2D
  ui/sheet.tsx             (MODIFY) variante modal centrado ≥md
  segmented.tsx            (no cambia; se oculta en desktop desde page.tsx)
app/
  page.tsx                 (MODIFY) móvil intacto (md:hidden) + DesktopBoard (hidden md:flex)
  globals.css              (MODIFY) keyframe de indicador de drop entre columnas
```

> Nota sobre nombres de campos SP1: este plan usa `task.status` con los 4 estados v2 y `task.due`. Donde el código actual del repo (v1) usa `task.time` y `status: "open"|"done"`, SP1 ya lo habrá migrado. Si la Tarea 0 detecta que SP1 **no** está aplicado, **detente** y ejecuta SP1 primero.

---

### Task 0: Verificación de prerrequisitos (SP1 + vitest)

**Files:** ninguno (solo lectura/verificación).

- [ ] Confirmar que SP1 migró el modelo. Ejecuta:
  ```bash
  grep -n 'in_progress\|"blocked"\|dueHasTime' /Users/samu/code/personal/Mark-V-Tsk/lib/types.ts
  ```
  Salida esperada: al menos una línea con `in_progress` y una con `dueHasTime`. Si **no** hay coincidencias, SP1 no está aplicado → **detente**, ejecuta el plan de SP1 y vuelve aquí.
- [ ] Confirmar vitest configurado por SP1:
  ```bash
  test -f /Users/samu/code/personal/Mark-V-Tsk/vitest.config.ts && grep -n '"test"' /Users/samu/code/personal/Mark-V-Tsk/package.json
  ```
  Salida esperada: el archivo existe y `package.json` tiene un script `test`. Si falta, instálalo (lo habría hecho SP1):
  ```bash
  pnpm add -D vitest
  ```
  y crea `vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    test: {
      environment: "node",
      include: ["lib/**/*.test.ts"],
    },
  });
  ```
  y añade a `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- [ ] Baseline limpio:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git status --porcelain
  ```
  Salida esperada: vacío (working tree limpio). Si no, haz stash o commit antes de empezar.
- [ ] Crear rama de trabajo:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git checkout -b sp3-desktop-responsive
  ```
  Salida esperada: `Switched to a new branch 'sp3-desktop-responsive'`.

_No hay commit en esta tarea._

---

### Task 1: Lógica pura del board 2D (TDD) — `lib/drag-board.ts`

**Files:**
- CREATE `lib/drag-board.ts`
- CREATE `lib/drag-board.test.ts`

Esta tarea sigue TDD estricto: tests primero, ver fallar, luego implementación, ver pasar.

- [ ] Escribir los tests primero. CREATE `lib/drag-board.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { resolveBucketAt, applyReorder, applyTransfer } from "./drag-board";
  import type { Bucket } from "./types";

  describe("resolveBucketAt", () => {
    const columns: { bucket: Bucket; rect: DOMRectLike }[] = [
      { bucket: "today", rect: { left: 0, right: 300 } },
      { bucket: "tomorrow", rect: { left: 300, right: 600 } },
      { bucket: "week", rect: { left: 600, right: 900 } },
    ];

    it("returns the bucket whose horizontal span contains x", () => {
      expect(resolveBucketAt(150, columns)).toBe("today");
      expect(resolveBucketAt(450, columns)).toBe("tomorrow");
      expect(resolveBucketAt(750, columns)).toBe("week");
    });

    it("clamps to the nearest edge column when x is out of bounds", () => {
      expect(resolveBucketAt(-50, columns)).toBe("today");
      expect(resolveBucketAt(9999, columns)).toBe("week");
    });

    it("returns null when there are no columns", () => {
      expect(resolveBucketAt(100, [])).toBeNull();
    });
  });

  describe("applyReorder", () => {
    it("moves an id to the slot of the hovered id (down)", () => {
      expect(applyReorder([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
    });

    it("moves an id to the slot of the hovered id (up)", () => {
      expect(applyReorder([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    });

    it("is a no-op when dragId equals overId", () => {
      expect(applyReorder([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
    });

    it("is a no-op when an id is missing", () => {
      expect(applyReorder([1, 2, 3], 9, 2)).toEqual([1, 2, 3]);
    });
  });

  describe("applyTransfer", () => {
    it("removes the id from source and appends to target end", () => {
      const r = applyTransfer({ today: [1, 2, 3], tomorrow: [4] }, 2, "today", "tomorrow");
      expect(r).toEqual({ today: [1, 3], tomorrow: [4, 2] });
    });

    it("inserts before overId in the target when provided", () => {
      const r = applyTransfer(
        { today: [1, 2], tomorrow: [4, 5] },
        2,
        "today",
        "tomorrow",
        5,
      );
      expect(r).toEqual({ today: [1], tomorrow: [4, 2, 5] });
    });

    it("is a no-op when source === target", () => {
      const board = { today: [1, 2], tomorrow: [3] };
      expect(applyTransfer(board, 1, "today", "today")).toEqual(board);
    });
  });
  ```
- [ ] Crear el tipo helper y el módulo vacío para que compile. CREATE `lib/drag-board.ts` con stubs que lancen:
  ```ts
  import type { Bucket } from "./types";

  export interface DOMRectLike {
    left: number;
    right: number;
  }

  export interface ColumnRect {
    bucket: Bucket;
    rect: DOMRectLike;
  }

  export function resolveBucketAt(x: number, columns: ColumnRect[]): Bucket | null {
    throw new Error("not implemented");
  }

  export function applyReorder(ids: number[], dragId: number, overId: number): number[] {
    throw new Error("not implemented");
  }

  export function applyTransfer(
    board: Partial<Record<Bucket, number[]>>,
    id: number,
    from: Bucket,
    to: Bucket,
    overId?: number,
  ): Partial<Record<Bucket, number[]>> {
    throw new Error("not implemented");
  }
  ```
- [ ] Ver fallar:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm test
  ```
  Salida esperada: los tests corren y fallan con `not implemented` (rojo). Confirma que vitest descubre `lib/drag-board.test.ts`.
- [ ] Implementar. Reemplaza el cuerpo de los tres stubs en `lib/drag-board.ts`:
  ```ts
  export function resolveBucketAt(x: number, columns: ColumnRect[]): Bucket | null {
    if (columns.length === 0) return null;
    // Direct hit: x dentro del span horizontal de una columna.
    for (const c of columns) {
      if (x >= c.rect.left && x <= c.rect.right) return c.bucket;
    }
    // Fuera de límites: clamp a la columna de borde más cercana.
    const first = columns[0];
    if (x < first.rect.left) return first.bucket;
    const last = columns[columns.length - 1];
    return last.bucket;
  }

  export function applyReorder(ids: number[], dragId: number, overId: number): number[] {
    if (dragId === overId) return ids;
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0) return ids;
    const next = ids.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  export function applyTransfer(
    board: Partial<Record<Bucket, number[]>>,
    id: number,
    from: Bucket,
    to: Bucket,
    overId?: number,
  ): Partial<Record<Bucket, number[]>> {
    if (from === to) return board;
    const src = (board[from] ?? []).filter((x) => x !== id);
    const dstPrev = board[to] ?? [];
    let dst: number[];
    if (overId != null) {
      const at = dstPrev.indexOf(overId);
      dst = dstPrev.slice();
      dst.splice(at < 0 ? dst.length : at, 0, id);
    } else {
      dst = [...dstPrev, id];
    }
    return { ...board, [from]: src, [to]: dst };
  }
  ```
- [ ] Ver pasar:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm test
  ```
  Salida esperada: todos los tests verdes (3 describes, 10 tests passed).
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add lib/drag-board.ts lib/drag-board.test.ts && git commit -m "feat(sp3): pure 2D board logic (resolveBucketAt, reorder, transfer) with tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 2: Query de transferencia entre buckets — `lib/db/queries.ts`

**Files:**
- MODIFY `lib/db/queries.ts` (añadir `transferTask`)

`moveTask` ya cambia el bucket pero pone `order = max+1` (al final). Para drag entre columnas con posición concreta necesitamos persistir un `order` derivado del array destino completo. Añadimos `transferTask` que reescribe el `order` de la columna destino en una transacción.

- [ ] Añadir la función al final de la sección Tasks de `lib/db/queries.ts`, justo después de `reorderTasks` (línea ~106):
  ```ts
  /**
   * Mueve una task a otro bucket y reescribe el order de la columna destino
   * según `orderedIds` (los ids que deben quedar en ese bucket, en orden).
   * Usado por el drag horizontal del board desktop.
   */
  export async function transferTask(
    id: number,
    toBucket: Bucket,
    orderedIds: number[],
  ): Promise<void> {
    await db.transaction("rw", db.tasks, async () => {
      await db.tasks.update(id, {
        bucket: toBucket,
        dayKey: toBucket === "today" ? localDateKey() : null,
      });
      await Promise.all(
        orderedIds.map((tid, i) => db.tasks.update(tid, { order: i })),
      );
    });
  }
  ```
  > `localDateKey` y `Bucket` ya están importados en este archivo (líneas 4–5). No añadir imports.
- [ ] Verificar typecheck:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores (exit 0).
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add lib/db/queries.ts && git commit -m "feat(sp3): transferTask query — change bucket + rewrite target order

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 3: Extensión 2D del hook — `lib/use-drag-reorder.ts`

**Files:**
- MODIFY `lib/use-drag-reorder.ts`

Se añade un modo opcional de transferencia entre columnas sin romper el uso 1D existente (TaskList/IdeaList lo siguen llamando con 2 args). La extensión:
- 3er parámetro opcional `transfer?: { bucket: Bucket; onTransfer: (id, toBucket) => void }`.
- En `onMove`, además del reorder vertical (lógica actual), detecta si el puntero está sobre **otra** columna vía `document.elementFromPoint(x, y).closest("[data-bucket]")`; si difiere del bucket propio, expone `dropBucket` (estado) para el indicador visual.
- En `onUp`, si hay un `dropBucket` distinto, llama `onTransfer(dragId, dropBucket)` en vez del commit de reorder.

- [ ] Reescribir `lib/use-drag-reorder.ts` completo:
  ```ts
  import { useEffect, useRef, useState } from "react";
  import type { Bucket } from "./types";

  interface TransferConfig {
    /** Bucket al que pertenece esta lista/columna. */
    bucket: Bucket;
    /** Se invoca al soltar sobre otra columna. */
    onTransfer: (id: number, toBucket: Bucket) => void;
  }

  /**
   * Pointer-event drag-to-reorder compartido por las listas de tasks e ideas
   * (touch + mouse, sin dependencias). Los items intercambian al cruzar el
   * punto medio de una fila; `commit` recibe el orden final de ids al soltar.
   *
   * Modo 2D opcional (`transfer`): si el puntero sale de la columna propia y
   * entra en otra (detectada por `[data-bucket]` bajo el cursor), al soltar se
   * llama `onTransfer(id, toBucket)` en lugar de `commit`. `dropBucket` expone
   * la columna destino candidata para pintar el indicador de drop.
   */
  export function useDragReorder<T extends { id?: number }>(
    items: T[],
    commit: (orderedIds: number[]) => void,
    transfer?: TransferConfig,
  ) {
    const [order, setOrder] = useState<T[]>(items);
    const dragId = useRef<number | null>(null);
    const [draggingId, setDraggingId] = useState<number | null>(null);
    const [dropBucket, setDropBucket] = useState<Bucket | null>(null);
    const dropBucketRef = useRef<Bucket | null>(null);
    const rowRefs = useRef<Map<number, HTMLElement>>(new Map());

    // Resync cuando cambian los datos subyacentes (toggles, adds, edits).
    useEffect(() => {
      if (dragId.current === null) setOrder(items);
    }, [items]);

    function rowRef(id: number) {
      return (el: HTMLElement | null) => {
        if (el) rowRefs.current.set(id, el);
        else rowRefs.current.delete(id);
      };
    }

    function setDrop(b: Bucket | null) {
      dropBucketRef.current = b;
      setDropBucket(b);
    }

    function onMove(e: React.PointerEvent) {
      if (dragId.current === null) return;

      // Modo 2D: ¿el puntero está sobre otra columna?
      if (transfer) {
        const el = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>("[data-bucket]");
        const overBucket = el?.dataset.bucket as Bucket | undefined;
        if (overBucket && overBucket !== transfer.bucket) {
          setDrop(overBucket);
          return; // No reordenar verticalmente mientras se apunta a otra columna.
        }
        if (dropBucketRef.current !== null) setDrop(null);
      }

      // Reorder vertical dentro de la columna propia (lógica original).
      const y = e.clientY;
      for (const [id, el] of rowRefs.current) {
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) {
          if (id !== dragId.current) {
            setOrder((prev) => {
              const from = prev.findIndex((t) => t.id === dragId.current);
              const to = prev.findIndex((t) => t.id === id);
              if (from < 0 || to < 0 || from === to) return prev;
              const next = prev.slice();
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved);
              return next;
            });
          }
          break;
        }
      }
    }

    function onUp() {
      const id = dragId.current;
      if (id !== null) {
        const target = dropBucketRef.current;
        if (transfer && target && target !== transfer.bucket) {
          transfer.onTransfer(id, target);
        } else {
          commit(order.map((t) => t.id!));
        }
      }
      dragId.current = null;
      setDraggingId(null);
      setDrop(null);
    }

    /** Spread sobre el drag-handle de la fila `id`. */
    function handleProps(id: number) {
      return {
        onPointerDown: (e: React.PointerEvent) => {
          dragId.current = id;
          setDraggingId(id);
          e.currentTarget.setPointerCapture(e.pointerId);
        },
        onPointerMove: onMove,
        onPointerUp: onUp,
        onPointerCancel: onUp,
      };
    }

    return { order, draggingId, dropBucket, rowRef, handleProps };
  }
  ```
  > Nota: `elementFromPoint` durante drag con `setPointerCapture` devuelve el elemento bajo el cursor real (la captura no afecta a `elementFromPoint`), por eso funciona la detección de columna destino.
- [ ] Verificar que el uso 1D existente sigue tipando (TaskList/IdeaList llaman con 2 args; el 3º es opcional):
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores (exit 0). `dropBucket` añadido al retorno no rompe a quien lo ignore.
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add lib/use-drag-reorder.ts && git commit -m "feat(sp3): 2D drag mode in useDragReorder (cross-column transfer + dropBucket)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 4: `TaskList` acepta transferencia 2D — `components/task-list.tsx`

**Files:**
- MODIFY `components/task-list.tsx`

`TaskList` debe poder operar en modo columna: recibir `bucket` y `onTransfer`, pasarlos al hook, y resaltar visualmente cuando es candidata a recibir un drop. En modo móvil (sin esas props) se comporta exactamente igual que hoy.

- [ ] Reescribir `components/task-list.tsx`:
  ```tsx
  "use client";

  import { GripVertical } from "lucide-react";
  import type { Bucket, Project, Task } from "@/lib/types";
  import { reorderTasks } from "@/lib/db/queries";
  import { useDragReorder } from "@/lib/use-drag-reorder";
  import { TaskRow } from "./task-row";
  import { cn } from "@/lib/utils";

  export function TaskList({
    tasks,
    projects,
    bucket,
    onTransfer,
  }: {
    tasks: Task[];
    projects: Map<number, Project>;
    /** Cuando se pasa, habilita drag horizontal entre columnas (board desktop). */
    bucket?: Bucket;
    onTransfer?: (id: number, toBucket: Bucket) => void;
  }) {
    const { order, draggingId, rowRef, handleProps } = useDragReorder(
      tasks,
      (ids) => void reorderTasks(ids),
      bucket && onTransfer ? { bucket, onTransfer } : undefined,
    );

    return (
      <ul className="flex flex-col gap-2">
        {order.map((t) => (
          <li
            key={t.id}
            ref={rowRef(t.id!)}
            className={cn(
              "transition-transform",
              draggingId === t.id && "scale-[1.02] opacity-95",
            )}
          >
            <TaskRow
              task={t}
              project={t.projectId ? projects.get(t.projectId) : undefined}
              handle={
                // En el board desktop, toda fila arrastra (incluidas las con
                // due/hora) para poder transferirla de columna. En móvil, las
                // tareas con hora siguen ordenando por su time y no arrastran.
                onTransfer || !t.time ? (
                  <button
                    aria-label="Drag to reorder or move bucket"
                    className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center text-muted active:cursor-grabbing"
                    {...handleProps(t.id!)}
                  >
                    <GripVertical size={16} />
                  </button>
                ) : undefined
              }
            />
          </li>
        ))}
      </ul>
    );
  }
  ```
  > El móvil no pasa `bucket`/`onTransfer`, así que `t.time ? undefined` se conserva (las tareas con hora no arrastran en móvil, igual que hoy). `dropBucket` no se usa aquí; el indicador de drop lo pinta `BoardColumn` (Tarea 6) sobre el contenedor de columna, no la lista.
- [ ] Typecheck:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores.
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add components/task-list.tsx && git commit -m "feat(sp3): TaskList optional 2D transfer mode (bucket + onTransfer)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 5: Sidebar desktop — `components/bottom-nav.tsx`

**Files:**
- MODIFY `components/bottom-nav.tsx`

El componente sigue siendo barra inferior `<768px` (3 items, intacto) y se convierte en sidebar real desde `md`: ancho `md:w-14` (tablet, solo iconos) → `lg:w-[220px]` (desktop, icono + label), 4 items (Hoy, Proyectos, Histórico, History), y theme toggle al fondo (`mt-auto`). Las labels se ocultan en tablet (`hidden lg:inline`).

- [ ] Reescribir `components/bottom-nav.tsx`:
  ```tsx
  "use client";

  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import {
    CalendarCheck,
    History as HistoryIcon,
    LayoutGrid,
    Sparkles,
  } from "lucide-react";
  import { Logo } from "./logo";
  import { ThemeToggle } from "./theme-toggle";
  import { cn } from "@/lib/utils";

  const tabs = [
    { href: "/", label: "Hoy", icon: CalendarCheck },
    { href: "/projects", label: "Proyectos", icon: LayoutGrid },
    { href: "/historico", label: "Histórico", icon: Sparkles },
    { href: "/history", label: "History", icon: HistoryIcon },
  ];

  // El 4º item (History) solo aparece en el sidebar desde md; en la barra
  // inferior móvil se mantienen 3 (History sigue accesible desde el header de Today).
  const mobileTabs = tabs.slice(0, 3);

  /**
   * Barra inferior en móvil (<768px); sidebar lateral desde md.
   * Tablet (md): solo iconos (~56px). Desktop (lg): icono + label (~220px).
   * <main> hace scroll, no este nav.
   */
  export function BottomNav() {
    const path = usePathname();
    const isActive = (href: string) =>
      href === "/" ? path === "/" : path.startsWith(href);

    return (
      <nav className="safe-bottom z-30 shrink-0 border-t border-border bg-surface/90 backdrop-blur md:flex md:h-full md:w-14 md:flex-col md:border-t-0 md:border-r md:bg-transparent md:px-2 md:py-6 md:backdrop-blur-none lg:w-[220px] lg:px-3">
        {/* Logo: solo en el sidebar (md+). */}
        <div className="mb-7 hidden items-center gap-2.5 px-1 md:flex lg:px-2">
          <Logo size={28} />
          <span className="hidden font-display text-[17px] font-bold lg:inline">
            Cadence
          </span>
        </div>

        {/* Items. Móvil: 3 en fila. Sidebar: 4 en columna. */}
        <div className="mx-auto flex max-w-md md:mx-0 md:max-w-none md:flex-col md:gap-1">
          {tabs.map((t) => {
            const active = isActive(t.href);
            const Icon = t.icon;
            const mobileHidden = !mobileTabs.includes(t);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-label={t.label}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition md:flex-none md:flex-row md:justify-center md:gap-3 md:rounded-xl md:px-0 md:py-2.5 md:text-[14px] lg:justify-start lg:px-3",
                  mobileHidden && "hidden md:flex",
                  active
                    ? "text-foreground md:bg-border/50"
                    : "text-muted md:hover:bg-border/30",
                )}
              >
                <Icon size={20} className={active ? "text-foreground" : ""} />
                <span className="lg:inline md:hidden">{t.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Theme toggle al fondo del sidebar (solo md+). */}
        <div className="mt-auto hidden px-1 md:flex md:justify-center lg:justify-start lg:px-2">
          <ThemeToggle />
        </div>
      </nav>
    );
  }
  ```
  > El `<span>` de label usa `lg:inline md:hidden`: oculto en tablet (solo iconos), visible en desktop. En móvil el span es visible por defecto (flujo de columna vertical inferior). El theme toggle del sidebar **no** duplica el del header de Today en móvil porque está bajo `hidden md:flex`.
- [ ] El header de Today (`app/page.tsx`) mantiene su `ThemeToggle` para móvil. El sidebar añade el suyo solo `md+`; en desktop ambos podrían verse, pero el header de Today se ocultará al pasar a `DesktopBoard` (Tarea 7). No hay duplicado visible. Verificar typecheck:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores.
- [ ] Verificación visual rápida del nav (móvil + tablet):
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm dev
  ```
  Abre `http://localhost:3000`. A 375px: barra inferior con 3 iconos (Hoy, Proyectos, Histórico). A 800px: sidebar estrecho solo-iconos con 4 items + theme toggle abajo. A 1280px: sidebar ancho con labels. Detén `pnpm dev` (Ctrl-C) tras comprobar.
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add components/bottom-nav.tsx && git commit -m "feat(sp3): sidebar desktop — 4 items, theme toggle, icon-only tablet / labeled desktop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 6: Columna del board — `components/board-column.tsx`

**Files:**
- CREATE `components/board-column.tsx`

Una columna del board: contenedor con `data-bucket` (para `elementFromPoint`), header con label + contador, su propio `QuickAdd`, y la `TaskList` en modo 2D. Resalta su borde cuando es candidata a recibir un drop (`isDropTarget`).

- [ ] CREATE `components/board-column.tsx`:
  ```tsx
  "use client";

  import { useLiveQuery } from "dexie-react-hooks";
  import { db } from "@/lib/db/schema";
  import { transferTask } from "@/lib/db/queries";
  import { TaskList } from "./task-list";
  import { QuickAdd } from "./quick-add";
  import { cn } from "@/lib/utils";
  import type { Bucket, Project, Task } from "@/lib/types";

  export function BoardColumn({
    bucket,
    label,
    tasks,
    projects,
    isDropTarget,
    onDragStateChange,
  }: {
    bucket: Bucket;
    label: string;
    tasks: Task[];
    projects: Map<number, Project>;
    isDropTarget: boolean;
    onDragStateChange: (dropBucket: Bucket | null) => void;
  }) {
    // Contador: tareas no archivadas y no done (criterio del board desktop).
    const openCount = tasks.filter((t) => t.status !== "done").length;

    async function handleTransfer(id: number, toBucket: Bucket) {
      // Reescribir el order del bucket destino: las tareas actuales del destino
      // (no done) seguidas de la transferida al final.
      const dest = await db.tasks
        .where("bucket")
        .equals(toBucket)
        .filter((t) => !t.archived)
        .toArray();
      const orderedIds = [...dest.map((t) => t.id!), id];
      await transferTask(id, toBucket, orderedIds);
      onDragStateChange(null);
    }

    return (
      <section
        data-bucket={bucket}
        className={cn(
          "flex min-w-0 flex-1 flex-col rounded-2xl border bg-background/40 p-3 transition-colors",
          isDropTarget
            ? "border-primary ring-2 ring-primary/40 board-drop"
            : "border-border",
        )}
      >
        <header className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="font-display text-[15px] font-bold">{label}</h2>
          <span className="text-[12px] tabular-nums text-muted">
            {openCount}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="px-1 py-6 text-center text-[13px] text-muted">
              Nada aquí. Arrastra una tarea o usa el +.
            </p>
          ) : (
            <BoardTaskList
              bucket={bucket}
              tasks={tasks}
              projects={projects}
              onTransfer={handleTransfer}
              onDropBucketChange={onDragStateChange}
            />
          )}
        </div>

        <div className="relative mt-2">
          <QuickAdd defaultBucket={bucket} variant="inline" />
        </div>
      </section>
    );
  }

  /**
   * Wrapper que conecta el dropBucket del hook (vía TaskList) al estado del
   * board. TaskList no expone dropBucket directamente, así que duplicamos el
   * hook aquí sería redundante; en su lugar TaskList reenvía el cambio.
   */
  function BoardTaskList({
    bucket,
    tasks,
    projects,
    onTransfer,
    onDropBucketChange,
  }: {
    bucket: Bucket;
    tasks: Task[];
    projects: Map<number, Project>;
    onTransfer: (id: number, toBucket: Bucket) => void;
    onDropBucketChange: (b: Bucket | null) => void;
  }) {
    void onDropBucketChange; // el board observa dropBucket vía DesktopBoard (Task 7)
    return (
      <TaskList
        tasks={tasks}
        projects={projects}
        bucket={bucket}
        onTransfer={onTransfer}
      />
    );
  }
  ```
  > **Decisión de propagación del `dropBucket`:** para que el resalte de la columna destino funcione, el `dropBucket` del hook (que vive dentro de `TaskList`) debe subir al board. En lugar de elevar estado a través de `TaskList`, la Tarea 7 hace que `DesktopBoard` calcule el `isDropTarget` de forma simple y robusta: escucha `pointermove` global durante un drag activo y resuelve la columna bajo el cursor con `resolveBucketAt`. Por eso `onDropBucketChange` aquí queda como no-op (`void`) y se elimina en la Tarea 7 si no se usa. Mantener el parámetro evita un segundo refactor de `TaskList`.
- [ ] Typecheck (fallará por `QuickAdd variant="inline"` hasta la Tarea 8; está bien, lo resolvemos antes de cerrar). Por ahora **no** typechequees aislado; sigue a la Tarea 7 y 8 y typechequea al final de la 8.
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add components/board-column.tsx && git commit -m "feat(sp3): BoardColumn — data-bucket, header+count, per-column quick-add, drop highlight

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 7: Board de 3 columnas + integración en Today — `components/desktop-board.tsx`, `app/page.tsx`

**Files:**
- CREATE `components/desktop-board.tsx`
- MODIFY `app/page.tsx`

`DesktopBoard` carga las tres listas, calcula la columna bajo el cursor durante un drag activo (para el resalte de drop) usando `resolveBucketAt` sobre los rects de las columnas, y renderiza tres `BoardColumn`. En `page.tsx`, el árbol móvil se envuelve en `md:hidden` y se añade `DesktopBoard` en `hidden md:flex`.

- [ ] CREATE `components/desktop-board.tsx`:
  ```tsx
  "use client";

  import { useEffect, useRef, useState } from "react";
  import { useLiveQuery } from "dexie-react-hooks";
  import { db } from "@/lib/db/schema";
  import { BUCKETS, type Bucket, type Project, type Task } from "@/lib/types";
  import { resolveBucketAt, type ColumnRect } from "@/lib/drag-board";
  import { BoardColumn } from "./board-column";

  export function DesktopBoard() {
    const projects = useLiveQuery(() => db.projects.toArray(), [], []);
    const tasks = useLiveQuery(
      () => db.tasks.filter((t) => !t.archived).toArray(),
      [],
      [],
    );

    const projectMap = new Map<number, Project>(
      projects.map((p) => [p.id!, p] as const),
    );

    // Columna candidata a drop durante un drag activo. Se calcula globalmente:
    // mientras hay un puntero presionado (capturado por un handle), resolvemos
    // la columna bajo el cursor por sus rects.
    const [dropBucket, setDropBucket] = useState<Bucket | null>(null);
    const boardRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    useEffect(() => {
      const el = boardRef.current;
      if (!el) return;
      const onDown = (e: PointerEvent) => {
        // Solo cuenta como drag si empezó en un drag-handle (cursor grab).
        const handle = (e.target as HTMLElement)?.closest(
          '[aria-label="Drag to reorder or move bucket"]',
        );
        dragging.current = !!handle;
      };
      const onMove = (e: PointerEvent) => {
        if (!dragging.current) return;
        const cols: ColumnRect[] = BUCKETS.map((b) => {
          const c = el.querySelector<HTMLElement>(`[data-bucket="${b.id}"]`);
          const r = c?.getBoundingClientRect();
          return { bucket: b.id, rect: { left: r?.left ?? 0, right: r?.right ?? 0 } };
        });
        const startCol = (e.target as HTMLElement)?.closest<HTMLElement>(
          "[data-bucket]",
        )?.dataset.bucket as Bucket | undefined;
        const over = resolveBucketAt(e.clientX, cols);
        setDropBucket(over && over !== startCol ? over : null);
      };
      const onUp = () => {
        dragging.current = false;
        setDropBucket(null);
      };
      el.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      return () => {
        el.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
    }, []);

    const byBucket = (b: Bucket): Task[] =>
      tasks
        .filter((t) => t.bucket === b)
        .slice()
        .sort(
          (a, b2) =>
            Number(a.status === "done") - Number(b2.status === "done") ||
            a.order - b2.order,
        );

    return (
      <div ref={boardRef} className="flex h-full gap-4 px-6 pt-6 pb-6">
        {BUCKETS.map((b) => (
          <BoardColumn
            key={b.id}
            bucket={b.id}
            label={b.label}
            tasks={byBucket(b.id)}
            projects={projectMap}
            isDropTarget={dropBucket === b.id}
            onDragStateChange={() => setDropBucket(null)}
          />
        ))}
      </div>
    );
  }
  ```
  > El resalte de drop se calcula aquí (no en el hook) para tener acceso a los rects de las tres columnas a la vez. El hook (`use-drag-reorder`) sigue siendo quien **ejecuta** la transferencia al soltar (vía `onTransfer` de `BoardColumn`); este efecto solo pinta el indicador. Doble fuente de verdad mínima y aislada al desktop.
- [ ] MODIFY `app/page.tsx`. Importar el board y envolver el árbol existente. Cambia el bloque de retorno. Primero añade el import tras la línea de imports de componentes (después de `import { ThemeToggle } ...`):
  ```tsx
  import { DesktopBoard } from "@/components/desktop-board";
  ```
- [ ] En `app/page.tsx`, envuelve TODO el `<div className="mx-auto w-full max-w-2xl ...">` actual (líneas 56–97) para que solo se muestre en móvil, y añade el board para desktop. Reemplaza:
  ```tsx
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-28 md:pb-10">
  ```
  por:
  ```tsx
    return (
      <>
      {/* Desktop: tres columnas. El Segmented desaparece (las 3 son visibles). */}
      <div className="hidden h-full md:block">
        <DesktopBoard />
      </div>

      {/* Móvil (<768px): layout actual intacto. */}
      <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-28 md:hidden">
  ```
  y reemplaza el cierre final del componente (la última línea antes de `}` del `return`, que es `    </div>\n  );`) por:
  ```tsx
      </div>
      </>
    );
  ```
  > El móvil pierde el `md:pb-10` (ya no aplica porque el div es `md:hidden`); se deja solo `pb-28`. El `QuickAdd` flotante móvil sigue dentro de este div. Las clases responsive `md:*` del header/segmented móvil ahora son inertes pero inofensivas.
- [ ] Typecheck (aún fallará por `QuickAdd variant`; lo arregla la Tarea 8). Continúa.
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add components/desktop-board.tsx app/page.tsx && git commit -m "feat(sp3): DesktopBoard 3-column view + mobile/desktop split in Today

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 8: QuickAdd con variante inline (por columna) — `components/quick-add.tsx`

**Files:**
- MODIFY `components/quick-add.tsx`

`QuickAdd` hoy es un FAB flotante fijo. El board necesita una variante `inline`: un input/botón compacto al pie de cada columna que abre el mismo sheet/modal con el bucket precargado. El FAB móvil queda intacto (variante por defecto `fab`).

- [ ] MODIFY la firma y el botón de `components/quick-add.tsx`. Cambia el bloque de props (líneas 15–21):
  ```tsx
  export function QuickAdd({
    defaultBucket = "today",
    defaultProjectId = null,
    variant = "fab",
  }: {
    defaultBucket?: Bucket;
    defaultProjectId?: number | null;
    variant?: "fab" | "inline";
  }) {
  ```
- [ ] Reemplaza el `<button ...>` del FAB (el primer botón dentro del `return`, líneas ~50–56) por un render condicional según `variant`. Sustituye:
  ```tsx
        <button
          onClick={openSheet}
          aria-label="Add task"
          className="fixed bottom-24 right-[max(1rem,calc(50%-13rem))] z-30 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-ink shadow-lg shadow-primary/40 transition active:scale-95 md:bottom-8 md:right-[max(2rem,calc(50%-22.5rem))] xl:right-[calc(50%-30.5rem)]"
        >
          <Plus size={26} />
        </button>
  ```
  por:
  ```tsx
        {variant === "fab" ? (
          <button
            onClick={openSheet}
            aria-label="Add task"
            className="fixed bottom-24 right-[max(1rem,calc(50%-13rem))] z-30 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-ink shadow-lg shadow-primary/40 transition active:scale-95 md:hidden"
          >
            <Plus size={26} />
          </button>
        ) : (
          <button
            onClick={openSheet}
            aria-label="Add task"
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-[13px] text-muted transition hover:border-primary hover:text-foreground"
          >
            <Plus size={16} /> Añadir
          </button>
        )}
  ```
  > El FAB pierde sus offsets `md:`/`xl:` y pasa a `md:hidden` (en desktop el quick-add vive en cada columna, no flotando). Esto **elimina** el FAB en desktop, intencionalmente. En móvil el FAB queda exactamente como antes (misma posición `bottom-24 right-[max(1rem,...)]`).
- [ ] Typecheck completo (ya con todas las piezas de Tareas 6–8):
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores (exit 0).
- [ ] Lint:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm lint
  ```
  Salida esperada: sin errores (warnings de `void onDropBucketChange` aceptables; si lint los marca como error, elimina ese parámetro no usado de `BoardTaskList` en `board-column.tsx`).
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add components/quick-add.tsx && git commit -m "feat(sp3): QuickAdd inline variant for board columns; FAB mobile-only

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 9: Indicador visual de drop + estado dragging — `app/globals.css`

**Files:**
- MODIFY `app/globals.css`

Animación sutil para la columna candidata a drop (`.board-drop`) y un cursor global durante el drag.

- [ ] Añadir al final de `app/globals.css`:
  ```css
  /* Columna candidata a recibir un drop entre buckets (desktop board). */
  @keyframes board-drop-pulse {
    from {
      background-color: color-mix(in srgb, var(--primary) 8%, transparent);
    }
    to {
      background-color: color-mix(in srgb, var(--primary) 16%, transparent);
    }
  }
  .board-drop {
    animation: board-drop-pulse 0.7s ease-in-out infinite alternate;
  }
  @media (prefers-reduced-motion: reduce) {
    .board-drop {
      animation: none;
      background-color: color-mix(in srgb, var(--primary) 12%, transparent);
    }
  }
  ```
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add app/globals.css && git commit -m "style(sp3): drop-target pulse for cross-column drag

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 10: Sheet → modal centrado ≥md — `components/ui/sheet.tsx`

**Files:**
- MODIFY `components/ui/sheet.tsx`

El mismo Radix Dialog: bottom sheet en móvil, modal centrado `max-w-[560px]` desde `md`. Solo cambian clases de `Dialog.Content` y se hace condicional el "grabber" (la barrita) y el ajuste de teclado (innecesario en modal de escritorio, pero inofensivo).

- [ ] MODIFY el `className` de `Dialog.Content` en `SheetContent` (líneas 81–84). Reemplaza:
  ```tsx
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl focus:outline-none",
            className,
          )}
  ```
  por:
  ```tsx
          className={cn(
            // Móvil: bottom sheet. ≥md: modal centrado (max-w-560).
            "fixed z-50 overflow-y-auto border-border bg-surface shadow-2xl focus:outline-none",
            "inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-md rounded-t-3xl border-t p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85vh] md:w-[560px] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border md:p-6 md:pb-6",
            className,
          )}
  ```
  > En `md+`: anclaje centrado con `left/top-1/2` + `-translate-*`, ancho fijo `560px` con tope `calc(100vw-2rem)`, bordes redondeados completos. Las clases `bottom-0`/`inset-x-0`/`rounded-t-3xl` se sobreescriben con sus variantes `md:` (`bottom-auto`, `inset-x-auto`, `rounded-3xl`). Radix ya provee fade del overlay; el `trackKeyboardInset` ajusta `el.style.bottom` solo en móvil donde aplica (en desktop `visualViewport` no cambia con el teclado físico, así que es inerte).
- [ ] Ocultar el grabber (barrita superior) en desktop. Reemplaza la línea del grabber (línea 87):
  ```tsx
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" />
  ```
  por:
  ```tsx
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border md:hidden" />
  ```
- [ ] Typecheck:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores.
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add components/ui/sheet.tsx && git commit -m "feat(sp3): sheet becomes centered modal (max-w-560) on >=md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 11: Grid de proyectos 3–4 col + detalle en dos columnas — `app/projects/page.tsx`, `components/project-detail.tsx`

**Files:**
- MODIFY `app/projects/page.tsx`
- MODIFY `components/project-detail.tsx`

- [ ] En `app/projects/page.tsx`, ampliar el contenedor en desktop y el grid. Reemplaza el wrapper (línea 72):
  ```tsx
      <div className="mx-auto w-full max-w-2xl px-4 pt-5">
  ```
  por:
  ```tsx
      <div className="mx-auto w-full max-w-2xl px-4 pt-5 md:max-w-5xl md:px-6">
  ```
- [ ] En el mismo archivo, ampliar el grid (línea 87):
  ```tsx
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
  ```
  por:
  ```tsx
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
  ```
- [ ] En `components/project-detail.tsx`, ampliar el contenedor (línea 91):
  ```tsx
      <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-10">
  ```
  por:
  ```tsx
      <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-10 lg:max-w-5xl lg:px-6">
  ```
- [ ] En `components/project-detail.tsx`, poner Tasks e Ideas en dos columnas desde `lg`. Las dos `<section>` (Tasks, líneas 134–146; Ideas, 148–177) deben envolverse en un grid. Inserta una apertura de grid antes de la `<section className="mb-7">` de Tasks y un cierre tras la `</section>` de Ideas. Reemplaza:
  ```tsx
        <section className="mb-7">
  ```
  (la primera, la de Tasks) por:
  ```tsx
        <div className="lg:grid lg:grid-cols-2 lg:gap-8">
        <section className="mb-7 lg:mb-0">
  ```
  y reemplaza el cierre de la sección de Ideas (la `</section>` de la línea 177, justo antes del `<Sheet ...>`) por:
  ```tsx
        </section>
        </div>
  ```
  > En `lg+`, Tasks (izquierda) e Ideas (derecha) quedan lado a lado; en móvil/tablet apiladas como hoy (`lg:mb-0` quita el margen inferior solo cuando son columnas).
- [ ] Typecheck:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores.
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add app/projects/page.tsx components/project-detail.tsx && git commit -m "feat(sp3): projects grid 3-4 cols + project detail two-column on desktop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 12: Atajos de teclado (N / Esc / Enter) — `components/quick-add.tsx`, sheet

**Files:**
- MODIFY `components/quick-add.tsx` (N enfoca quick-add de Today; Enter ya guarda)
- (Esc ya lo maneja Radix Dialog; Enter ya está en los inputs)

YAGNI: solo `N`, `Esc`, `Enter`. `Esc` cierra el modal (Radix Dialog ya lo hace por defecto). `Enter` guarda (ya implementado en los `onKeyDown` de los inputs). Falta `N`: cuando el foco **no** está en un input/textarea/contenteditable, `N` abre y enfoca el quick-add del bucket Today.

- [ ] El board de Today renderiza tres `QuickAdd` (uno por columna). `N` debe abrir el de Today. Añadimos un listener global de teclado solo en la variante `inline` con `defaultBucket === "today"`. En `components/quick-add.tsx`, añade el import de `useEffect` (línea 3):
  ```tsx
  import { useEffect, useState } from "react";
  ```
- [ ] Tras la declaración de estados (después de la línea `const projects = useLiveQuery(...)`, ~línea 31), añade el efecto de atajo:
  ```tsx
    // Atajo global: "N" abre el quick-add de Today cuando el foco no está en un
    // campo de texto. Solo la instancia inline de Today escucha (evita duplicados).
    useEffect(() => {
      if (variant !== "inline" || defaultBucket !== "today") return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== "n" && e.key !== "N") return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const el = document.activeElement as HTMLElement | null;
        const tag = el?.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          el?.isContentEditable
        )
          return;
        e.preventDefault();
        openSheet();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
      // openSheet es estable entre renders (no usa deps externas mutables).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variant, defaultBucket]);
  ```
  > `openSheet` resetea el bucket a `defaultBucket` ("today") y abre el sheet con `autoFocus` en el input (el `<Input autoFocus>` ya existe), cumpliendo "N enfoca quick-add de Today". `Esc` lo cierra (Radix), `Enter` guarda (onKeyDown existente). Sin más atajos.
- [ ] Typecheck + lint:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm exec tsc --noEmit && pnpm lint
  ```
  Salida esperada: sin errores.
- [ ] Commit:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git add components/quick-add.tsx && git commit -m "feat(sp3): keyboard — N focuses Today quick-add (Esc/Enter via Radix+inputs)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 13: Verificación manual por breakpoint + regresión móvil

**Files:** ninguno (verificación).

- [ ] Build de producción (confirma que el static export compila con todo SP3):
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm build
  ```
  Salida esperada: `✓ Compiled successfully`, exporta rutas estáticas, **sin errores**. Si falla, arregla antes de continuar.
- [ ] Tests siguen verdes:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm test
  ```
  Salida esperada: 10 tests passed.
- [ ] Arrancar dev:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm dev
  ```
- [ ] **375px (móvil — REGRESIÓN, debe quedar idéntico a antes de SP3):**
  - Today: header con logo + ThemeToggle, `Segmented` (Today/Tomorrow/Week) visible, una sola lista, FAB `+` flotante abajo-derecha.
  - Barra inferior con 3 iconos (Hoy, Proyectos, Histórico). **Sin** sidebar.
  - Tap en una task abre **bottom sheet** (anclado abajo, con grabber).
  - Proyectos: grid 2 columnas. Detalle: Tasks e Ideas apiladas.
  - Drag de tareas sin hora reordena; tareas con hora no arrastran.
- [ ] **800px (tablet):**
  - Sidebar estrecho solo-iconos (4 iconos) a la izquierda + theme toggle abajo. **Sin** barra inferior.
  - Today: tres columnas (Today/Tomorrow/This Week), cada una con contador y "Añadir". `Segmented` **no** visible.
  - Tap en task abre **modal centrado** (~560px), no bottom sheet.
- [ ] **1280px (desktop):**
  - Sidebar ancho con labels (Hoy, Proyectos, Histórico, History) + Cadence + theme toggle abajo.
  - Three columns; arrastra una task de Today a This Week: la columna destino pulsa (borde primary), al soltar la task cambia de columna y persiste (recarga y sigue en This Week).
  - Drag vertical dentro de una columna reordena.
  - `N` (sin foco en input) abre el modal de Add con bucket Today; `Esc` lo cierra; escribir y `Enter` lo guarda.
  - Proyectos: grid 4 columnas. Detalle: Tasks (izq) e Ideas (der) lado a lado.
- [ ] Detén `pnpm dev` (Ctrl-C).
- [ ] _No hay commit (solo verificación). Si algún paso falla, corrige en la tarea correspondiente y vuelve a verificar._

---

### Task 14: Verificación con Playwright MCP (si está disponible) + cierre

**Files:** ninguno.

- [ ] Si el Playwright MCP está disponible en la sesión, arranca dev en background y captura screenshots a los tres breakpoints:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm dev
  ```
  Con Playwright MCP:
  1. `browser_navigate` → `http://localhost:3000`
  2. `browser_resize` 375×812 → `browser_take_screenshot` (verifica: barra inferior, Segmented, FAB).
  3. `browser_resize` 800×1000 → `browser_take_screenshot` (verifica: sidebar iconos, 3 columnas, sin Segmented).
  4. `browser_resize` 1280×900 → `browser_take_screenshot` (verifica: sidebar con labels, 3 columnas).
  5. Navega a `/projects` en 1280 → screenshot (grid 4 col).
  6. (Opcional) Prueba el drag entre columnas con `browser_drag` desde el handle de una task de Today al contenedor de This Week; verifica con un `browser_snapshot` que la task cambió de columna.
  Si el MCP **no** está disponible, salta esta tarea y confía en la verificación manual de la Tarea 13.
- [ ] Detén `pnpm dev`.
- [ ] Verificación final completa de una pasada:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build
  ```
  Salida esperada: typecheck limpio, lint limpio, 10 tests passed, build OK.
- [ ] Revisar el diff completo de SP3:
  ```bash
  cd /Users/samu/code/personal/Mark-V-Tsk && git log --oneline main..HEAD && git diff --stat main..HEAD
  ```
  Salida esperada: ~13 commits de SP3; los archivos tocados coinciden con la File Structure.
- [ ] Usar la skill `superpowers:finishing-a-development-branch` para decidir merge/PR/cleanup de `sp3-desktop-responsive`. **No** hacer merge ni push sin que el usuario lo pida.

---

## Notas de verificación / criterios de éxito (del spec)

- **Lighthouse mobile ≥90 se mantiene:** el árbol móvil no cambia; el board desktop está bajo `hidden md:flex` (no se hidrata visualmente en móvil, pero sí está en el DOM — coste mínimo). Si Lighthouse mobile bajara, considerar montar `DesktopBoard` solo tras un `matchMedia("(min-width:768px)")` en `useEffect` (no necesario por defecto; YAGNI hasta que se mida regresión).
- **Drag entre columnas en desktop:** Tareas 1, 3, 4, 6, 7 (lógica testeada en `drag-board.test.ts`).
- **Sin regresión móvil:** Tarea 13, paso 375px, explícito.

## Desviaciones del spec

1. **Sidebar colapsable a iconos:** el spec menciona "colapsable a iconos". Este plan implementa el colapso **por breakpoint** (tablet `md` = solo iconos, desktop `lg` = labels) en lugar de un botón de colapso manual con estado persistido. Es la interpretación más simple que cubre el requisito explícito ("en tablet solo iconos") sin estado extra (YAGNI). Si se desea toggle manual, es una iteración aislada sobre `bottom-nav.tsx`.
2. **`N` con múltiples quick-adds:** como Today renderiza tres quick-adds (uno por columna), el atajo `N` se ancla solo a la instancia `inline` del bucket `today` para evitar listeners duplicados. Cumple "N enfoca quick-add de Today" literalmente.
3. **Resalte de drop calculado en `DesktopBoard`, no en el hook:** el `dropBucket` del hook existe y dispara la transferencia, pero el **indicador visual** se calcula en `DesktopBoard` (acceso a los rects de las 3 columnas a la vez). Decisión pragmática para evitar elevar estado a través de `TaskList`; documentada en Tareas 6–7.
4. **FAB eliminado en desktop:** el spec pide quick-add por columna en desktop; el FAB flotante pasa a `md:hidden`. Coherente con "cada columna con su quick-add propio".

Ninguna desviación cambia el alcance funcional de SP3; son decisiones de implementación dentro del espíritu YAGNI del roadmap.
