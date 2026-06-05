# Cadence v2 — Diseño: contenido rico, estados, desktop y backend Supabase

- **Fecha:** 2026-06-05
- **Estado:** Aprobado en brainstorming (pendiente revisión final del spec)
- **Baseline:** v1 + Prompt 2 (ver `2026-06-02-cadence-design.md`, `2026-06-03-prompt2-mobile-ux-design.md`)
- **Decisión deliberada:** este diseño **rompe el principio #1 del roadmap** ("local-first sin backend") al adoptar Supabase con login Google obligatorio. La app sigue siendo offline-first en operación (Dexie es la verdad local), pero requiere cuenta.

## Resumen de decisiones

| Tema | Decisión |
|---|---|
| Secuencia | Features locales primero (SP1–SP3), backend al final (SP4) |
| Backend | Supabase (auth + Postgres + Storage + Realtime), **cuenta separada** del resto de proyectos |
| Static export | Se mantiene — todo Supabase es client-side (`@supabase/supabase-js`) |
| Login | Google, **obligatorio** (primera vez por dispositivo; después offline OK) |
| Sync | Push/pull manual, last-write-wins por `updatedAt`, tombstones |
| Realtime | Sync al focus/visibilitychange + Supabase Realtime con app visible |
| Estados de task | todo ⇄ in_progress ⇄ blocked → done; tap cicla, blocked solo desde sheet |
| Fechas | Un solo campo `due` (timestamp, hora opcional); buckets siguen manuales |
| Texto | Multilínea en título + checklist de sub-tareas embebido |
| Fotos | En tasks, ideas y backlog; galería + cámara + portapapeles; WebP comprimido |
| Vista expandida | Bottom sheet (móvil) / modal (desktop), patrón Radix existente |
| Desktop | Sidebar + Today/Tomorrow/Week en columnas con drag entre buckets |
| UI | Iconos lucide siempre, nunca emojis |
| Turso | **Descartado** (jun 2026): sync browser en beta, exigía abandonar static export |

## Sub-proyectos

Cada SP tiene su propio plan de implementación y ciclo de review. Orden: SP1 → SP2 → SP3 → SP4 (SP2/SP3 intercambiables).

### SP1 — Modelo v2 + contenido rico

**Migración Dexie v1→v2** (in-place, sin pérdida):

- `Task.status`: `"todo" | "in_progress" | "blocked" | "done"` — migra `open`→`todo`.
- `Task.due?: number | null` + `Task.dueHasTime: boolean` — migra el `time` actual (task de hoy con `time` 15:00 → `due` = hoy 15:00, `dueHasTime` true); el campo `time` se elimina.
- `Task.subtasks: { id: string; text: string; done: boolean }[]` (default `[]`).
- `Task.title` acepta `\n` (preview ~2 líneas + ellipsis).
- `guid: string` (UUID v4) y `updatedAt: number` en **todas** las entidades — preparación para sync; los ids numéricos locales se conservan como PK de Dexie.
- `Idea` y `BacklogItem` ganan simétricamente: `links: string[]`, `due`/`dueHasTime`, `subtasks`, multilínea, `guid`, `updatedAt`.
- Borrado = tombstone (`deletedAt`) en vez de delete físico; las queries filtran `deletedAt == null`. Habilita undo y el sync futuro.
- **Export JSON completo** en un Settings mínimo — red de seguridad previa a cualquier migración (roadmap Tier 1.4).

**UI:**

- Círculo de task → indicador de estado lucide: `Circle` → `CircleDot` → `CheckCircle2`; tap cicla en ese orden. `Ban` (ámbar) = blocked, solo desde el sheet. Done conserva archivado y History. El rollover preserva estado + `carried`.
- Sheet expandido (tap en task/idea/backlog item): selector de estado, texto multilínea editable, checklist con progreso, chips de links, campo due (date + time picker), acciones (mover bucket, promover, borrar). Mismo componente sheet existente.
- Chips en preview, orden fijo: `[due] [checklist n/m] [links] [fotos]`. Due: `Clock` + formato relativo corto (`hoy 3pm`, `jun 12`), rojo si vencida. Checklist: pill `1/3`.
- Links en ideas/backlog: mismo `extractLinks`/`linkLabel`/`LinkChip` de tasks.
- Quick-add multilínea (Shift+Enter desktop, botón expandir móvil).
- Promover idea → task transfiere todo: links, fotos, checklist, due.

### SP2 — Fotos

- Tabla nueva:
  ```
  photos: { id, guid, parentType: "task"|"idea"|"backlog", parentGuid,
            blob (WebP ≤1600px), thumb (WebP ~200px), width, height,
            createdAt, updatedAt, deletedAt, remoteUrl: null hasta SP4 }
  ```
- Captura: picker de archivos, `capture=environment` (cámara móvil), paste de portapapeles en quick-add y sheet.
- Compresión client-side al adjuntar: resize ≤1600px, WebP q≈0.8 + thumb 200px (canvas; sin dependencias nuevas si es viable).
- Preview de fila: un único chip `Image` + contador. En el sheet: grid de thumbnails; tap → viewer a pantalla completa (swipe entre fotos, botón borrar).
- El binario nunca entra en la entidad ni en el sync relacional.

### SP3 — Desktop responsive

- `<768px`: layout actual intacto. `768–1023px`: sidebar de iconos + columna centrada ancha. `≥1024px`: layout completo.
- Sidebar (~220px, colapsable a iconos): logo, nav vertical (Hoy, Proyectos, Histórico, History), theme toggle. Bottom-nav se oculta.
- Today/Tomorrow/This Week como columnas lado a lado, cada una con header, contador y quick-add. Drag vertical = reorder; drag horizontal = cambio de bucket (extensión de `use-drag-reorder`).
- Proyectos: grid 3–4 columnas; detalle de proyecto con tasks/ideas en dos columnas.
- Sheet → modal centrado (max-width ~560px) en ≥768px vía el mismo Radix Dialog.
- Teclado: `N` enfoca quick-add, `Esc` cierra modal, `Enter` guarda. Nada más (YAGNI).

### SP4 — Backend Supabase + sync + migración

**Setup:** proyecto Supabase en **cuenta separada** (no la org `dux14`). CLI vía `SUPABASE_ACCESS_TOKEN` en `.env.local` (gitignored) para no pisar la sesión global. Registrar el setup en `~/code/SETUP.md` y samu-flow al ejecutarlo.

**Auth:** `@supabase/supabase-js` client-side; static export se mantiene. Sin sesión → pantalla de login solo-Google. Sesión persistida → arranque offline sin red; re-auth silenciosa al volver la conexión. RLS `user_id = auth.uid()` en todas las tablas.

**Schema espejo (Postgres):** `projects`, `tasks`, `ideas`, `backlog`, `photos` con PK = `guid`, columnas `updated_at`, `deleted_at`, `user_id`. Fotos: solo metadata + `storage_path` (bucket privado, URLs firmadas).

**Protocolo sync:**

- Dexie es la verdad local; la UI nunca espera red.
- Escritura local → fila dirty (nuevo `updatedAt`) → push con debounce (upsert; el servidor acepta si `updated_at` entrante ≥ existente).
- Pull: `where updated_at > :lastSyncedAt` (cursor en `meta`), aplicado con LWW; tombstones borran local.
- Disparadores: tras guardar (push), `visibilitychange`/`focus` (pull), Supabase Realtime con la app visible.
- Blobs: subida a Storage en background con red; otros dispositivos ven chip "pendiente"; al descargar se cachea en IndexedDB.

**Migración de datos existentes:**

1. Export JSON disponible desde SP1 (pre-migración).
2. Migraciones Dexie nativas v1→v2 (SP1) — sin pérdida.
3. Primer login (SP4): bulk push inicial de todo lo local; verificación de conteos local = remoto antes de declarar migrado.
4. Fallo de sync → la app sigue local; export JSON siempre en Settings.

**Bordes:** sin red en el primer login → mensaje claro (no hay modo anónimo, decisión deliberada). Token expirado offline → app sigue local. Free tier (500MB DB, 1GB Storage) suficiente con compresión WebP.

## Research que sustenta el descarte de Turso (jun 2026)

- `@tursodatabase/sync-wasm` (la pieza local-first browser) en beta 0.3.x con OPFS inmaduro (issue tursodatabase/turso#2799).
- Embedded replicas no funcionan en navegador (requieren filesystem).
- Tokens por usuario exigen endpoint servidor → rompería `output: "export"`.
- Dexie Cloud descartado: sin Google login nativo, lock-in alto.
- Supabase: auth Google client-side, Storage y Realtime en free tier (50k MAU, 1GB), patrón push/pull LWW estándar para single-user.

## Criterios de éxito

- **SP1:** datos v1 migran sin pérdida (verificado con export antes/después); estados ciclan con tap; texto multilínea y checklist visibles en sheet; links como chips en ideas; due con overdue rojo.
- **SP2:** foto de 4MB queda ≤300KB; chip con contador en preview; viewer fullscreen; paste funciona en desktop.
- **SP3:** Lighthouse mobile ≥90 se mantiene; drag entre columnas en desktop; sin regresión móvil.
- **SP4:** primer login migra todo (conteos verificados); editar en desktop se refleja en móvil al volver a la app; modo avión = app plenamente funcional.

## Fuera de alcance

Colaboración multi-usuario, notificaciones push, recurrencias, búsqueda, share target (siguen en el roadmap v2 general), markdown completo.
