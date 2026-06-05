# SP4 — Backend Supabase + sync + migración (Cadence v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Lee el plan completo antes de empezar. Cada tarea es un commit. NO uses las MCP tools de Supabase; todo va por la CLI `supabase` con `SUPABASE_ACCESS_TOKEN` y SQL en migraciones versionadas en `supabase/migrations/`. Los pasos marcados **[MANUAL — usuario]** los ejecuta el humano: detente y pídeselos explícitamente, no los simules.

- **Fecha:** 2026-06-05
- **Spec:** `docs/superpowers/specs/2026-06-05-cadence-v2-design.md` (sección SP4 + "Research que sustenta el descarte de Turso")
- **Prerrequisitos:** SP1 (modelo v2: `guid`, `updatedAt`, `deletedAt`, tombstones filtrados en queries, export JSON, tipos `TaskStatus`/`Subtask`) y SP2 (tabla `photos` con `blob`/`thumb`/`remoteUrl`). Asume que esos planes ya se ejecutaron y mergearon.

---

## Goal

Conectar Cadence a un backend Supabase (auth Google obligatorio + Postgres espejo + Storage + Realtime) **manteniendo static export** (`output: "export"`, cero API routes / middleware), de modo que:

- Dexie sigue siendo la verdad local; la UI nunca espera red.
- Un sync push/pull last-write-wins (LWW) por `updatedAt`/`updated_at` mantiene N dispositivos consistentes.
- El primer login migra TODO lo local al servidor con verificación de conteos antes de declarar la migración completa.
- Las fotos suben su blob a Storage en background y se descargan on-demand vía URL firmada en otros dispositivos.
- Sin red en el primer login → mensaje claro (no hay modo anónimo); token expirado offline → la app sigue local.

## Architecture

```
┌─────────────────────── Browser (static export, client-side puro) ───────────────────────┐
│                                                                                          │
│  React UI ──escribe──► lib/db/queries.ts ──► Dexie (CadenceDB, v2)  ◄── VERDAD LOCAL     │
│     ▲                          │ (cada write bumpea updatedAt + marca dirty)             │
│     │ useLiveQuery             ▼                                                          │
│     │                   lib/sync/engine.ts (lógica pura, cliente Supabase inyectado)     │
│     │                     ├─ push(): filas updatedAt > lastPushedAt → upsert batch        │
│     │                     ├─ pull(): updated_at > cursor → aplica LWW local + tombstones  │
│     │                     ├─ migrateInitial(): bulk push cursor 0 + verificación conteos  │
│     │                     └─ photo queue: blob → Storage, remoteUrl null → storage_path   │
│     │                          │                                                          │
│  SyncStatus (header, lucide) ◄─┘ disparadores: debounce write · focus/online · Realtime  │
│                                                                                          │
│  lib/supabase/client.ts ──► @supabase/supabase-js (auth localStorage, Realtime, Storage) │
└──────────────────────────────────────┬───────────────────────────────────────────────────┘
                                        │ HTTPS (anon key + JWT del usuario)
                          ┌─────────────▼──────────────┐
                          │  Supabase (cuenta separada) │
                          │  auth.users (Google OAuth)  │
                          │  public.projects/tasks/     │  RLS: user_id = auth.uid()
                          │   ideas/backlog/photos      │  (select/insert/update/delete)
                          │  storage bucket "photos"    │  política por user_id en el path
                          │  Realtime postgres_changes  │
                          └────────────────────────────┘
```

**Principio LWW:** `updated_at` (epoch ms, `bigint`) es el reloj. En push, el servidor sólo acepta la fila entrante si `excluded.updated_at >= tabla.updated_at`. En pull, el cliente aplica la fila remota sólo si `remote.updated_at > local.updatedAt`. Empates → el remoto gana (idempotente). Tombstones (`deleted_at != null`) se propagan en ambas direcciones; el cliente borra físicamente la fila local al recibir un tombstone remoto.

**Static export se mantiene:** todo el código Supabase corre en el cliente. Ninguna tarea añade `app/api/**`, `middleware.ts`, ni cambia `output: "export"`.

## Tech Stack

- Next.js 16 static export (`output: "export"`), React 19, TypeScript strict.
- Dexie 4 + dexie-react-hooks (sin cambios de versión de schema en SP4; sólo se añade `meta` sync state, ya existente como tabla `meta`).
- `@supabase/supabase-js` (única dependencia nueva de runtime).
- Serwist PWA (sin cambios).
- vitest + fake-indexeddb (configurados en SP1) + `@vitest/coverage-v8`.
- supabase CLI (binario global) autenticado vía `SUPABASE_ACCESS_TOKEN` en `.env.local`.
- Iconos: **lucide-react siempre, nunca emojis**. Gestor: **pnpm siempre**.

## Mapeo snake_case (Postgres) ↔ camelCase (Dexie/TS) — contrato único

Este mapeo es la fuente de verdad para `lib/sync/mappers.ts`. El `id` numérico local de Dexie **no** viaja al servidor (es PK local de autoincremento); la PK estable cross-device es `guid`.

| Entidad  | Dexie (camelCase)                                                                                                   | Postgres (snake_case)                                                                                          |
|----------|---------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| project  | `guid, name, kind, color, order, createdAt, archivedAt, updatedAt, deletedAt`                                       | `guid, name, kind, color, "order", created_at, archived_at, updated_at, deleted_at, user_id`                  |
| task     | `guid, title, links, projectGuid, bucket, status, order, createdAt, completedAt, due, dueHasTime, subtasks, carried, dayKey, archived, archivedAt, updatedAt, deletedAt` | `guid, title, links, project_guid, bucket, status, "order", created_at, completed_at, due, due_has_time, subtasks, carried, day_key, archived, archived_at, updated_at, deleted_at, user_id` |
| idea     | `guid, projectGuid, text, status, links, due, dueHasTime, subtasks, order, createdAt, updatedAt, deletedAt`         | `guid, project_guid, text, status, links, due, due_has_time, subtasks, "order", created_at, updated_at, deleted_at, user_id` |
| backlog  | `guid, title, note, links, due, dueHasTime, subtasks, order, createdAt, promotedProjectGuid, updatedAt, deletedAt`  | `guid, title, note, links, due, due_has_time, subtasks, "order", created_at, promoted_project_guid, updated_at, deleted_at, user_id` |
| photo    | `guid, parentType, parentGuid, width, height, createdAt, updatedAt, deletedAt, remoteUrl` (+ `blob`/`thumb` SOLO local) | `guid, parent_type, parent_guid, width, height, created_at, updated_at, deleted_at, storage_path, user_id` (SIN blob/thumb) |

Notas de contrato:
- **Relaciones por guid:** las FK locales numéricas (`projectId`) se traducen a `projectGuid` antes de subir. SP1/SP2 ya guardan `guid` en cada entidad; SP4 añade los campos `*Guid` derivados en los mappers leyendo la fila padre por `id`. Si una entidad apunta a un padre por `id` numérico, el mapper resuelve `guid` con una lectura puntual a Dexie.
- `links` y `subtasks` viajan como `jsonb`.
- `order` es palabra reservada en Postgres → siempre entre comillas dobles en SQL.
- `due`, `*At` y `updated_at`/`deleted_at` son epoch ms (`bigint`), no timestamptz, para evitar conversiones de zona y empatar con Dexie.
- `photo.blob`/`photo.thumb` nunca salen en el payload relacional; van por Storage.

---

## File Structure

```
supabase/
  config.toml                      # CLI config (project_id placeholder, ignorado en git si trae secretos)
  migrations/
    20260605000001_initial_schema.sql      # 5 tablas + columnas + índices
    20260605000002_rls_policies.sql        # RLS activado + políticas por tabla
    20260605000003_storage_photos.sql      # bucket privado + políticas de Storage
    20260605000004_realtime.sql            # publication para las 5 tablas
lib/
  supabase/
    client.ts                      # createClient singleton (anon key, persistSession)
    auth.ts                        # signInWithGoogle, getCachedSession, onAuthChange, signOut
  sync/
    types.ts                       # SyncClient (interfaz inyectable), Row types, SyncState
    mappers.ts                     # toRemote*/fromRemote* (camelCase↔snake_case) por entidad
    dirty.ts                       # markDirty, getDirtyRows, clearDirty, cursor helpers (sobre meta)
    engine.ts                      # push, pull, applyRemote (LWW), migrateInitial, verifyCounts
    photos.ts                      # uploadPhotoQueue, downloadPhoto (signed URL → blob cache)
    supabase-client-adapter.ts     # implementa SyncClient sobre @supabase/supabase-js
    orchestrator.ts                # debounce/triggers/realtime → llama engine (efectos)
components/
  auth-gate.tsx                    # pantalla login solo-Google; bloquea hasta sesión o cache offline
  sync-status.tsx                  # icono lucide en header: synced/pending/offline
lib/sync/__tests__/
  mappers.test.ts
  engine.test.ts                   # LWW, cursor, dirty queue, tombstones, migración/conteos
  photos.test.ts                   # re-parent / cola de subida con cliente mockeado
.env.local                         # [gitignored] SUPABASE_ACCESS_TOKEN, NEXT_PUBLIC_SUPABASE_URL/ANON_KEY
.env.example                       # plantilla commiteada (sin valores)
```

---

## Task 1: [MANUAL — usuario] Crear cuenta y proyecto Supabase separados + token CLI

**Objetivo:** Provisionar el backend en una cuenta DISTINTA de la org `dux14` del CLI global, sin pisar la sesión global de `supabase login`.

**Files:** ninguno de código (sólo `.env.local`, gitignored).

- [ ] **[MANUAL — usuario]** Crear (o usar) una cuenta de Supabase separada para Cadence. En el dashboard, **New project**: nombre `cadence`, región cercana, generar y guardar la DB password. Anotar el **Project Ref** (string en la URL `app.supabase.com/project/<ref>`).
- [ ] **[MANUAL — usuario]** En esa cuenta: **Account → Access Tokens → Generate new token**, nombre `cadence-cli`. Copiar el token (se muestra una sola vez).
- [ ] **[MANUAL — usuario]** En **Project Settings → API**: copiar `Project URL` y la `anon` `public` key.
- [ ] Crear `.env.local` en la raíz (ya está en `.gitignore` vía `.env*`) con:
  ```bash
  # Supabase CLI (cuenta separada — NO la org dux14)
  SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxx
  SUPABASE_PROJECT_REF=xxxxxxxxxxxxxxxxxxxx
  # Cliente (públicos, también irán a Vercel env)
  NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
  ```
- [ ] Crear `.env.example` commiteable (plantilla, sin valores reales):
  ```bash
  SUPABASE_ACCESS_TOKEN=
  SUPABASE_PROJECT_REF=
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  ```
- [ ] Verificar que el token funciona SIN tocar la sesión global (la CLI prioriza la env var sobre la sesión de `supabase login`):
  ```bash
  set -a; source .env.local; set +a
  supabase projects list
  ```
  Salida esperada: una tabla que incluye el proyecto `cadence` con su `REFERENCE ID` = `$SUPABASE_PROJECT_REF`.
- [ ] Inicializar la estructura local de Supabase y enlazar el proyecto:
  ```bash
  set -a; source .env.local; set +a
  supabase init        # crea supabase/config.toml y supabase/ (responde "N" a generar VS Code settings)
  supabase link --project-ref "$SUPABASE_PROJECT_REF"
  ```
  Salida esperada: `Finished supabase link.` y un `supabase/config.toml` con `project_id`.
- [ ] Añadir a `.gitignore` las piezas locales de Supabase que pueden traer secretos:
  ```
  # Supabase local
  supabase/.branches
  supabase/.temp
  ```
- [ ] **Commit:** `chore(sp4): supabase project scaffolding + env template`
  (Commitea `supabase/config.toml`, `supabase/migrations/` vacío, `.env.example`, `.gitignore`. NUNCA `.env.local`.)

---

## Task 2: Instalar @supabase/supabase-js y configurar vitest coverage

**Files:** `package.json`, `vitest.config.ts` (creado en SP1; se extiende), `lib/supabase/client.ts`

- [ ] Instalar dependencias:
  ```bash
  pnpm add @supabase/supabase-js
  pnpm add -D @vitest/coverage-v8
  ```
  Salida esperada: `@supabase/supabase-js` aparece en `dependencies`.
- [ ] Confirmar que vitest ya corre (configurado en SP1):
  ```bash
  pnpm vitest run
  ```
  Salida esperada: la suite existente de SP1/SP2 pasa en verde.
- [ ] Crear el cliente singleton `lib/supabase/client.ts`:
  ```ts
  import { createClient, type SupabaseClient } from "@supabase/supabase-js";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Static export: this module only runs in the browser. We tolerate a missing
  // env at build time (export prerender) and fail loudly at first client use.
  let cached: SupabaseClient | null = null;

  export function getSupabase(): SupabaseClient {
    if (cached) return cached;
    if (!url || !anonKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
      );
    }
    cached = createClient(url, anonKey, {
      auth: {
        persistSession: true, // localStorage — survives offline cold start
        autoRefreshToken: true,
        detectSessionInUrl: true, // OAuth redirect lands back here
      },
    });
    return cached;
  }
  ```
- [ ] Verificar typecheck:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores.
- [ ] **Commit:** `feat(sp4): supabase-js client singleton + coverage dep`

---

## Task 3: Migración SQL — schema espejo de las 5 tablas

**Files:** `supabase/migrations/20260605000001_initial_schema.sql`

- [ ] Escribir la migración completa (epoch ms en `bigint`, `order` citado, `jsonb` para links/subtasks):
  ```sql
  -- 20260605000001_initial_schema.sql
  -- Mirror of the Dexie v2 model. PK = guid (stable cross-device).
  -- Timestamps are epoch milliseconds (bigint) to match the Dexie clock.

  create table public.projects (
    guid        uuid primary key,
    user_id     uuid not null references auth.users (id) on delete cascade,
    name        text not null,
    kind        text not null,
    color       text not null,
    "order"     integer not null default 0,
    created_at  bigint not null,
    archived_at bigint,
    updated_at  bigint not null,
    deleted_at  bigint
  );

  create table public.tasks (
    guid         uuid primary key,
    user_id      uuid not null references auth.users (id) on delete cascade,
    title        text not null,
    links        jsonb not null default '[]'::jsonb,
    project_guid uuid,
    bucket       text not null,
    status       text not null,
    "order"      integer not null default 0,
    created_at   bigint not null,
    completed_at bigint,
    due          bigint,
    due_has_time boolean not null default false,
    subtasks     jsonb not null default '[]'::jsonb,
    carried      boolean not null default false,
    day_key      text,
    archived     boolean not null default false,
    archived_at  bigint,
    updated_at   bigint not null,
    deleted_at   bigint
  );

  create table public.ideas (
    guid         uuid primary key,
    user_id      uuid not null references auth.users (id) on delete cascade,
    project_guid uuid,
    text         text not null,
    status       text not null,
    links        jsonb not null default '[]'::jsonb,
    due          bigint,
    due_has_time boolean not null default false,
    subtasks     jsonb not null default '[]'::jsonb,
    "order"      integer not null default 0,
    created_at   bigint not null,
    updated_at   bigint not null,
    deleted_at   bigint
  );

  create table public.backlog (
    guid                 uuid primary key,
    user_id              uuid not null references auth.users (id) on delete cascade,
    title                text not null,
    note                 text,
    links                jsonb not null default '[]'::jsonb,
    due                  bigint,
    due_has_time         boolean not null default false,
    subtasks             jsonb not null default '[]'::jsonb,
    "order"              integer not null default 0,
    created_at           bigint not null,
    promoted_project_guid uuid,
    updated_at           bigint not null,
    deleted_at           bigint
  );

  create table public.photos (
    guid         uuid primary key,
    user_id      uuid not null references auth.users (id) on delete cascade,
    parent_type  text not null,
    parent_guid  uuid not null,
    width        integer not null,
    height       integer not null,
    storage_path text,
    created_at   bigint not null,
    updated_at   bigint not null,
    deleted_at   bigint
  );

  -- Pull cursor reads filter on updated_at; index it per table.
  create index projects_updated_at_idx on public.projects (user_id, updated_at);
  create index tasks_updated_at_idx    on public.tasks    (user_id, updated_at);
  create index ideas_updated_at_idx    on public.ideas    (user_id, updated_at);
  create index backlog_updated_at_idx  on public.backlog  (user_id, updated_at);
  create index photos_updated_at_idx   on public.photos   (user_id, updated_at);
  ```
- [ ] **Verificación local sin tocar producción** (si Docker está disponible): aplica la migración a un stack local efímero y comprueba que parsea.
  ```bash
  set -a; source .env.local; set +a
  supabase db lint --schema public   # valida el SQL de migraciones
  ```
  Salida esperada: `No schema errors found` (o la lista vacía de issues). Si Docker no está disponible, salta al push en la Task 5.
- [ ] **Commit:** `feat(sp4): initial postgres schema mirror (5 tables)`

---

## Task 4: Migraciones SQL — RLS, Storage y Realtime

**Files:** `supabase/migrations/20260605000002_rls_policies.sql`, `supabase/migrations/20260605000003_storage_photos.sql`, `supabase/migrations/20260605000004_realtime.sql`

- [ ] RLS activado en TODAS las tablas con política `user_id = auth.uid()` para las 4 operaciones:
  ```sql
  -- 20260605000002_rls_policies.sql
  alter table public.projects enable row level security;
  alter table public.tasks    enable row level security;
  alter table public.ideas    enable row level security;
  alter table public.backlog  enable row level security;
  alter table public.photos   enable row level security;

  -- One policy per (table, action). Pattern is identical across tables:
  -- the row is visible/writable only when it belongs to the caller.
  -- projects
  create policy projects_select on public.projects for select using (user_id = auth.uid());
  create policy projects_insert on public.projects for insert with check (user_id = auth.uid());
  create policy projects_update on public.projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy projects_delete on public.projects for delete using (user_id = auth.uid());
  -- tasks
  create policy tasks_select on public.tasks for select using (user_id = auth.uid());
  create policy tasks_insert on public.tasks for insert with check (user_id = auth.uid());
  create policy tasks_update on public.tasks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy tasks_delete on public.tasks for delete using (user_id = auth.uid());
  -- ideas
  create policy ideas_select on public.ideas for select using (user_id = auth.uid());
  create policy ideas_insert on public.ideas for insert with check (user_id = auth.uid());
  create policy ideas_update on public.ideas for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy ideas_delete on public.ideas for delete using (user_id = auth.uid());
  -- backlog
  create policy backlog_select on public.backlog for select using (user_id = auth.uid());
  create policy backlog_insert on public.backlog for insert with check (user_id = auth.uid());
  create policy backlog_update on public.backlog for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy backlog_delete on public.backlog for delete using (user_id = auth.uid());
  -- photos
  create policy photos_select on public.photos for select using (user_id = auth.uid());
  create policy photos_insert on public.photos for insert with check (user_id = auth.uid());
  create policy photos_update on public.photos for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  create policy photos_delete on public.photos for delete using (user_id = auth.uid());
  ```
- [ ] Bucket privado `photos` con políticas por `user_id` en el primer segmento del path (`<user_id>/<guid>.webp`):
  ```sql
  -- 20260605000003_storage_photos.sql
  insert into storage.buckets (id, name, public)
  values ('photos', 'photos', false)
  on conflict (id) do nothing;

  -- Path convention: "<user_id>/<photo_guid>.webp".
  -- (storage.foldername(name))[1] is the first path segment = the owner's uid.
  create policy photos_storage_select on storage.objects for select
    using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy photos_storage_insert on storage.objects for insert
    with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy photos_storage_update on storage.objects for update
    using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
  create policy photos_storage_delete on storage.objects for delete
    using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
  ```
- [ ] Realtime: añadir las 5 tablas a la publication `supabase_realtime`:
  ```sql
  -- 20260605000004_realtime.sql
  alter publication supabase_realtime add table public.projects;
  alter publication supabase_realtime add table public.tasks;
  alter publication supabase_realtime add table public.ideas;
  alter publication supabase_realtime add table public.backlog;
  alter publication supabase_realtime add table public.photos;
  ```
- [ ] **Commit:** `feat(sp4): RLS policies, private photos bucket, realtime publication`

---

## Task 5: [MANUAL — usuario] Aplicar migraciones al proyecto remoto + Google OAuth

**Files:** ninguno de código.

- [ ] Empujar todas las migraciones al proyecto remoto vía CLI (NO MCP):
  ```bash
  set -a; source .env.local; set +a
  supabase db push
  ```
  Salida esperada: lista las 4 migraciones `20260605000001..04` como `Applying migration ...` y termina con `Finished supabase db push.`
- [ ] Verificar que las tablas existen y RLS está activo:
  ```bash
  set -a; source .env.local; set +a
  supabase db remote commit --dry-run 2>/dev/null || true
  ```
  (Verificación principal: en el dashboard, **Database → Tables** muestra las 5 tablas; **Authentication → Policies** muestra 4 políticas por tabla; **Storage** muestra el bucket privado `photos`.)
- [ ] **[MANUAL — usuario]** Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID** (tipo *Web application*). En **Authorized redirect URIs** añadir el callback de Supabase:
  ```
  https://<project-ref>.supabase.co/auth/v1/callback
  ```
  Guardar el **Client ID** y **Client secret**.
- [ ] **[MANUAL — usuario]** Configurar la pantalla de consentimiento OAuth (External, modo Testing es suficiente para uso personal; añadir el email del usuario como test user). Scopes: `email`, `profile`, `openid` (default).
- [ ] **[MANUAL — usuario]** Supabase dashboard → **Authentication → Providers → Google**: pegar Client ID y Client secret, **Enable**. En **Authentication → URL Configuration → Redirect URLs** añadir las URLs de la app donde aterriza el OAuth:
  ```
  http://localhost:3000
  https://<dominio-vercel-de-cadence>
  ```
  (Una entrada por entorno; sin estas, `signInWithOAuth` rechaza el redirect.)
- [ ] **[MANUAL — usuario]** Vercel: añadir las env públicas al proyecto (Production + Preview + Development):
  ```bash
  vercel env add NEXT_PUBLIC_SUPABASE_URL
  vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
  ```
  (Pegar los mismos valores de `.env.local`. NO subir `SUPABASE_ACCESS_TOKEN` a Vercel: es sólo para CLI local.)
- [ ] **Sin commit** (paso operativo). Confirmar al equipo/usuario que el backend está listo antes de seguir.

---

## Task 6: Tipos de sync + interfaz SyncClient inyectable (TDD base)

**Files:** `lib/sync/types.ts`

Esta tarea define el contrato que el motor de sync usará. El cliente real y el mock implementan `SyncClient`; el motor nunca importa `@supabase/supabase-js` directamente (testabilidad).

- [ ] Crear `lib/sync/types.ts`:
  ```ts
  // Snake_case row shapes as stored in Postgres. The engine speaks these;
  // mappers translate to/from the camelCase Dexie entities.
  export type Table = "projects" | "tasks" | "ideas" | "backlog" | "photos";

  export interface RemoteRowBase {
    guid: string;
    user_id: string;
    updated_at: number;
    deleted_at: number | null;
  }
  // Engine treats remote rows generically; mappers know the concrete columns.
  export type RemoteRow = RemoteRowBase & Record<string, unknown>;

  export interface UpsertResult {
    /** guids the server accepted (passed the LWW where-clause). */
    accepted: string[];
  }

  /**
   * Minimal surface the sync engine needs. Implemented for real by
   * supabase-client-adapter.ts and mocked in tests. Keeps the engine pure.
   */
  export interface SyncClient {
    getUserId(): Promise<string | null>;
    /** LWW upsert: server keeps the row only if incoming updated_at >= current. */
    upsert(table: Table, rows: RemoteRow[]): Promise<UpsertResult>;
    /** Rows for this user with updated_at > cursor, ascending. */
    pullSince(table: Table, cursor: number): Promise<RemoteRow[]>;
    /** Count of non-deleted rows for this user (migration verification). */
    countLive(table: Table): Promise<number>;
    uploadPhoto(path: string, blob: Blob): Promise<void>;
    createSignedUrl(path: string, expiresInSec: number): Promise<string>;
  }

  export type SyncState = "synced" | "pending" | "offline";

  export const SYNC_TABLES: Table[] = [
    "projects",
    "tasks",
    "ideas",
    "backlog",
    "photos",
  ];
  ```
- [ ] Typecheck:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores.
- [ ] **Commit:** `feat(sp4): sync SyncClient interface + remote row types`

---

## Task 7: Mappers camelCase ↔ snake_case (TDD)

**Files:** `lib/sync/mappers.ts`, `lib/sync/__tests__/mappers.test.ts`

Usa superpowers:test-driven-development: escribe los tests primero (rojo), luego el mapper (verde).

- [ ] Escribir `lib/sync/__tests__/mappers.test.ts` primero:
  ```ts
  import { describe, it, expect } from "vitest";
  import {
    taskToRemote,
    taskFromRemote,
    projectToRemote,
    photoToRemote,
  } from "@/lib/sync/mappers";
  import type { Task } from "@/lib/types";

  const baseTask: Task = {
    id: 1,
    guid: "11111111-1111-4111-8111-111111111111",
    title: "Write plan",
    links: ["https://x.com"],
    projectId: null,
    bucket: "today",
    status: "todo",
    order: 3,
    createdAt: 1000,
    completedAt: null,
    due: 2000,
    dueHasTime: true,
    subtasks: [{ id: "s1", text: "draft", done: false }],
    carried: false,
    dayKey: "2026-06-05",
    archived: false,
    archivedAt: null,
    updatedAt: 5000,
    deletedAt: null,
  };

  describe("task mappers", () => {
    it("maps camelCase → snake_case with user_id and project_guid", () => {
      const r = taskToRemote(baseTask, "user-42", "proj-guid-9");
      expect(r).toMatchObject({
        guid: baseTask.guid,
        user_id: "user-42",
        project_guid: "proj-guid-9",
        due_has_time: true,
        day_key: "2026-06-05",
        updated_at: 5000,
        deleted_at: null,
      });
      expect(r.subtasks).toEqual(baseTask.subtasks);
      expect("projectId" in r).toBe(false);
      expect("id" in r).toBe(false);
    });

    it("round-trips snake_case → camelCase (id/projectId resolved by caller)", () => {
      const r = taskToRemote(baseTask, "user-42", "proj-guid-9");
      const back = taskFromRemote(r);
      expect(back.guid).toBe(baseTask.guid);
      expect(back.dueHasTime).toBe(true);
      expect(back.dayKey).toBe("2026-06-05");
      expect(back.subtasks).toEqual(baseTask.subtasks);
      // local-only fields are not present on the remote row
      expect(back).not.toHaveProperty("id");
      expect(back).not.toHaveProperty("projectId");
    });

    it("project maps order via quoted column key", () => {
      const r = projectToRemote(
        {
          id: 2,
          guid: "p-guid",
          name: "Cadence",
          kind: "active",
          color: "#A9C8EE",
          order: 7,
          createdAt: 1,
          archivedAt: null,
          updatedAt: 9,
          deletedAt: null,
        },
        "user-42",
      );
      expect(r.order).toBe(7);
      expect(r.user_id).toBe("user-42");
    });

    it("photo maps to metadata only — no blob/thumb", () => {
      const r = photoToRemote(
        {
          id: 5,
          guid: "ph-guid",
          parentType: "task",
          parentGuid: "t-guid",
          blob: new Blob(["x"]),
          thumb: new Blob(["y"]),
          width: 800,
          height: 600,
          createdAt: 1,
          updatedAt: 2,
          deletedAt: null,
          remoteUrl: null,
        },
        "user-42",
        "user-42/ph-guid.webp",
      );
      expect(r).toMatchObject({
        guid: "ph-guid",
        parent_type: "task",
        parent_guid: "t-guid",
        storage_path: "user-42/ph-guid.webp",
        width: 800,
      });
      expect("blob" in r).toBe(false);
      expect("thumb" in r).toBe(false);
    });
  });
  ```
- [ ] Correr y ver fallar:
  ```bash
  pnpm vitest run lib/sync/__tests__/mappers.test.ts
  ```
  Salida esperada: falla (módulo aún no existe).
- [ ] Implementar `lib/sync/mappers.ts`. Asume los tipos v2 de SP1/SP2 (`Task`, `Project`, `Idea`, `BacklogItem`, `Photo` con `guid`/`updatedAt`/`deletedAt`):
  ```ts
  import type {
    Project,
    Task,
    Idea,
    BacklogItem,
    Photo,
  } from "@/lib/types";
  import type { RemoteRow } from "@/lib/sync/types";

  // ---- projects ----
  export function projectToRemote(p: Project, userId: string): RemoteRow {
    return {
      guid: p.guid,
      user_id: userId,
      name: p.name,
      kind: p.kind,
      color: p.color,
      order: p.order,
      created_at: p.createdAt,
      archived_at: p.archivedAt ?? null,
      updated_at: p.updatedAt,
      deleted_at: p.deletedAt ?? null,
    };
  }
  export function projectFromRemote(r: RemoteRow): Omit<Project, "id"> {
    return {
      guid: r.guid as string,
      name: r.name as string,
      kind: r.kind as Project["kind"],
      color: r.color as string,
      order: r.order as number,
      createdAt: r.created_at as number,
      archivedAt: (r.archived_at as number | null) ?? null,
      updatedAt: r.updated_at as number,
      deletedAt: (r.deleted_at as number | null) ?? null,
    };
  }

  // ---- tasks ----
  export function taskToRemote(
    t: Task,
    userId: string,
    projectGuid: string | null,
  ): RemoteRow {
    return {
      guid: t.guid,
      user_id: userId,
      title: t.title,
      links: t.links,
      project_guid: projectGuid,
      bucket: t.bucket,
      status: t.status,
      order: t.order,
      created_at: t.createdAt,
      completed_at: t.completedAt ?? null,
      due: t.due ?? null,
      due_has_time: t.dueHasTime,
      subtasks: t.subtasks,
      carried: t.carried ?? false,
      day_key: t.dayKey ?? null,
      archived: t.archived ?? false,
      archived_at: t.archivedAt ?? null,
      updated_at: t.updatedAt,
      deleted_at: t.deletedAt ?? null,
    };
  }
  /** projectId is resolved by the caller (guid→local id lookup); not here. */
  export function taskFromRemote(r: RemoteRow): Omit<Task, "id" | "projectId"> {
    return {
      guid: r.guid as string,
      title: r.title as string,
      links: (r.links as string[]) ?? [],
      bucket: r.bucket as Task["bucket"],
      status: r.status as Task["status"],
      order: r.order as number,
      createdAt: r.created_at as number,
      completedAt: (r.completed_at as number | null) ?? null,
      due: (r.due as number | null) ?? null,
      dueHasTime: Boolean(r.due_has_time),
      subtasks: (r.subtasks as Task["subtasks"]) ?? [],
      carried: Boolean(r.carried),
      dayKey: (r.day_key as string | null) ?? null,
      archived: Boolean(r.archived),
      archivedAt: (r.archived_at as number | null) ?? null,
      updatedAt: r.updated_at as number,
      deletedAt: (r.deleted_at as number | null) ?? null,
    };
  }
  /** project_guid travels with the remote row; caller resolves to local id. */
  export function taskRemoteProjectGuid(r: RemoteRow): string | null {
    return (r.project_guid as string | null) ?? null;
  }

  // ---- ideas ----
  export function ideaToRemote(
    i: Idea,
    userId: string,
    projectGuid: string | null,
  ): RemoteRow {
    return {
      guid: i.guid,
      user_id: userId,
      project_guid: projectGuid,
      text: i.text,
      status: i.status,
      links: i.links ?? [],
      due: i.due ?? null,
      due_has_time: i.dueHasTime ?? false,
      subtasks: i.subtasks ?? [],
      order: i.order,
      created_at: i.createdAt,
      updated_at: i.updatedAt,
      deleted_at: i.deletedAt ?? null,
    };
  }
  export function ideaFromRemote(r: RemoteRow): Omit<Idea, "id" | "projectId"> {
    return {
      guid: r.guid as string,
      text: r.text as string,
      status: r.status as Idea["status"],
      links: (r.links as string[]) ?? [],
      due: (r.due as number | null) ?? null,
      dueHasTime: Boolean(r.due_has_time),
      subtasks: (r.subtasks as Idea["subtasks"]) ?? [],
      order: r.order as number,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      deletedAt: (r.deleted_at as number | null) ?? null,
    };
  }
  export function ideaRemoteProjectGuid(r: RemoteRow): string | null {
    return (r.project_guid as string | null) ?? null;
  }

  // ---- backlog ----
  export function backlogToRemote(
    b: BacklogItem,
    userId: string,
    promotedProjectGuid: string | null,
  ): RemoteRow {
    return {
      guid: b.guid,
      user_id: userId,
      title: b.title,
      note: b.note ?? null,
      links: b.links ?? [],
      due: b.due ?? null,
      due_has_time: b.dueHasTime ?? false,
      subtasks: b.subtasks ?? [],
      order: b.order,
      created_at: b.createdAt,
      promoted_project_guid: promotedProjectGuid,
      updated_at: b.updatedAt,
      deleted_at: b.deletedAt ?? null,
    };
  }
  export function backlogFromRemote(
    r: RemoteRow,
  ): Omit<BacklogItem, "id" | "promotedProjectId"> {
    return {
      guid: r.guid as string,
      title: r.title as string,
      note: (r.note as string | undefined) ?? undefined,
      links: (r.links as string[]) ?? [],
      due: (r.due as number | null) ?? null,
      dueHasTime: Boolean(r.due_has_time),
      subtasks: (r.subtasks as BacklogItem["subtasks"]) ?? [],
      order: r.order as number,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      deletedAt: (r.deleted_at as number | null) ?? null,
    };
  }
  export function backlogRemotePromotedGuid(r: RemoteRow): string | null {
    return (r.promoted_project_guid as string | null) ?? null;
  }

  // ---- photos (metadata only) ----
  export function photoToRemote(
    p: Photo,
    userId: string,
    storagePath: string | null,
  ): RemoteRow {
    return {
      guid: p.guid,
      user_id: userId,
      parent_type: p.parentType,
      parent_guid: p.parentGuid,
      width: p.width,
      height: p.height,
      storage_path: storagePath,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      deleted_at: p.deletedAt ?? null,
    };
  }
  /** No blob/thumb on the remote row; downloaded on demand via signed URL. */
  export function photoFromRemote(
    r: RemoteRow,
  ): Omit<Photo, "id" | "blob" | "thumb"> {
    return {
      guid: r.guid as string,
      parentType: r.parent_type as Photo["parentType"],
      parentGuid: r.parent_guid as string,
      width: r.width as number,
      height: r.height as number,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      deletedAt: (r.deleted_at as number | null) ?? null,
      remoteUrl: (r.storage_path as string | null) ?? null,
    };
  }
  export function photoRemoteStoragePath(r: RemoteRow): string | null {
    return (r.storage_path as string | null) ?? null;
  }
  ```
- [ ] Correr hasta verde:
  ```bash
  pnpm vitest run lib/sync/__tests__/mappers.test.ts
  ```
  Salida esperada: todos los tests pasan.
- [ ] **Commit:** `feat(sp4): entity mappers camelCase↔snake_case (TDD)`

---

## Task 8: Dirty tracking + cursor sobre la tabla meta (TDD)

**Files:** `lib/sync/dirty.ts`, `lib/sync/__tests__` (cubierto dentro de engine.test.ts en la Task 9)

El "dirty set" y el cursor de pull viven en la tabla `meta` (ya existe en `schema.ts`). Estrategia: el push selecciona filas con `updatedAt > lastPushedAt[table]`; el cursor de pull es `pullCursor[table]`. No hace falta un flag booleano por fila: `updatedAt` ya es monótono y lo bumpea cada write de SP1.

- [ ] Crear `lib/sync/dirty.ts`:
  ```ts
  import { db, getMeta, setMeta } from "@/lib/db/schema";
  import type { Table } from "@/lib/sync/types";

  const PUSH_KEY = (t: Table) => `sync.lastPushedAt.${t}`;
  const PULL_KEY = (t: Table) => `sync.pullCursor.${t}`;

  export async function getLastPushedAt(t: Table): Promise<number> {
    return getMeta<number>(PUSH_KEY(t), 0);
  }
  export async function setLastPushedAt(t: Table, value: number): Promise<void> {
    await setMeta(PUSH_KEY(t), value);
  }
  export async function getPullCursor(t: Table): Promise<number> {
    return getMeta<number>(PULL_KEY(t), 0);
  }
  export async function setPullCursor(t: Table, value: number): Promise<void> {
    await setMeta(PULL_KEY(t), value);
  }

  const TABLE_REF = {
    projects: () => db.projects,
    tasks: () => db.tasks,
    ideas: () => db.ideas,
    backlog: () => db.backlog,
  } as const;

  /** Local rows changed since the last successful push (updatedAt is monotonic). */
  export async function getDirtyRows<T extends { updatedAt: number }>(
    table: Exclude<Table, "photos">,
    since: number,
  ): Promise<T[]> {
    const all = (await TABLE_REF[table]().toArray()) as unknown as T[];
    return all.filter((r) => r.updatedAt > since);
  }

  /** Reset all cursors — used to force a full re-push (initial migration). */
  export async function resetSyncCursors(): Promise<void> {
    const tables: Table[] = ["projects", "tasks", "ideas", "backlog", "photos"];
    await Promise.all(
      tables.flatMap((t) => [setLastPushedAt(t, 0), setPullCursor(t, 0)]),
    );
  }
  ```
- [ ] Typecheck:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores.
- [ ] **Commit:** `feat(sp4): dirty tracking + pull cursor over meta table`

---

## Task 9: Motor de sync — push, pull (LWW), migración + verificación (TDD)

**Files:** `lib/sync/engine.ts`, `lib/sync/__tests__/engine.test.ts`

Núcleo de SP4. TDD con un `SyncClient` mockeado. Cubre: LWW local (remoto más nuevo gana / más viejo se ignora), avance de cursor, cola de push (dirty), tombstones, verificación de conteos de migración.

- [ ] Escribir `lib/sync/__tests__/engine.test.ts` primero. Usa fake-indexeddb (setup de SP1) y un mock in-memory de `SyncClient`:
  ```ts
  import { describe, it, expect, beforeEach } from "vitest";
  import "fake-indexeddb/auto";
  import { db } from "@/lib/db/schema";
  import type { RemoteRow, SyncClient, Table } from "@/lib/sync/types";
  import { pushTable, pullTable, migrateInitial, verifyCounts } from "@/lib/sync/engine";
  import { getPullCursor } from "@/lib/sync/dirty";

  function makeMockClient(userId: string | null): {
    client: SyncClient;
    store: Map<Table, Map<string, RemoteRow>>;
  } {
    const store = new Map<Table, Map<string, RemoteRow>>();
    const tableMap = (t: Table) => {
      if (!store.has(t)) store.set(t, new Map());
      return store.get(t)!;
    };
    const client: SyncClient = {
      async getUserId() {
        return userId;
      },
      async upsert(table, rows) {
        const m = tableMap(table);
        const accepted: string[] = [];
        for (const row of rows) {
          const cur = m.get(row.guid);
          // LWW: server keeps incoming only if updated_at >= current.
          if (!cur || (row.updated_at as number) >= (cur.updated_at as number)) {
            m.set(row.guid, row);
            accepted.push(row.guid);
          }
        }
        return { accepted };
      },
      async pullSince(table, cursor) {
        return [...tableMap(table).values()]
          .filter((r) => (r.updated_at as number) > cursor)
          .sort((a, b) => (a.updated_at as number) - (b.updated_at as number));
      },
      async countLive(table) {
        return [...tableMap(table).values()].filter((r) => r.deleted_at == null)
          .length;
      },
      async uploadPhoto() {},
      async createSignedUrl() {
        return "https://signed.example/x";
      },
    };
    return { client, store };
  }

  beforeEach(async () => {
    await Promise.all([
      db.projects.clear(),
      db.tasks.clear(),
      db.ideas.clear(),
      db.backlog.clear(),
      db.meta.clear(),
    ]);
  });

  describe("pushTable", () => {
    it("pushes only rows newer than lastPushedAt and advances it", async () => {
      const { client, store } = makeMockClient("u1");
      await db.tasks.add({
        guid: "g1", title: "a", links: [], projectId: null, bucket: "today",
        status: "todo", order: 0, createdAt: 1, completedAt: null, due: null,
        dueHasTime: false, subtasks: [], carried: false, dayKey: null,
        archived: false, archivedAt: null, updatedAt: 100, deletedAt: null,
      });
      await pushTable("tasks", client, "u1");
      expect(store.get("tasks")!.get("g1")).toBeDefined();
      // second push with no new changes sends nothing new
      const before = store.get("tasks")!.size;
      await pushTable("tasks", client, "u1");
      expect(store.get("tasks")!.size).toBe(before);
    });
  });

  describe("pullTable LWW", () => {
    it("newer remote wins over local", async () => {
      const { client } = makeMockClient("u1");
      await db.tasks.add({
        guid: "g1", title: "local", links: [], projectId: null, bucket: "today",
        status: "todo", order: 0, createdAt: 1, completedAt: null, due: null,
        dueHasTime: false, subtasks: [], carried: false, dayKey: null,
        archived: false, archivedAt: null, updatedAt: 100, deletedAt: null,
      });
      await client.upsert("tasks", [{
        guid: "g1", user_id: "u1", title: "remote-newer", links: [],
        project_guid: null, bucket: "today", status: "done", order: 0,
        created_at: 1, completed_at: 200, due: null, due_has_time: false,
        subtasks: [], carried: false, day_key: null, archived: false,
        archived_at: null, updated_at: 200, deleted_at: null,
      }]);
      await pullTable("tasks", client);
      const row = await db.tasks.where("guid").equals("g1").first();
      expect(row!.title).toBe("remote-newer");
      expect(row!.status).toBe("done");
    });

    it("older remote is ignored", async () => {
      const { client } = makeMockClient("u1");
      await db.tasks.add({
        guid: "g2", title: "local-newer", links: [], projectId: null,
        bucket: "today", status: "todo", order: 0, createdAt: 1,
        completedAt: null, due: null, dueHasTime: false, subtasks: [],
        carried: false, dayKey: null, archived: false, archivedAt: null,
        updatedAt: 500, deletedAt: null,
      });
      await client.upsert("tasks", [{
        guid: "g2", user_id: "u1", title: "remote-older", links: [],
        project_guid: null, bucket: "today", status: "todo", order: 0,
        created_at: 1, completed_at: null, due: null, due_has_time: false,
        subtasks: [], carried: false, day_key: null, archived: false,
        archived_at: null, updated_at: 300, deleted_at: null,
      }]);
      await pullTable("tasks", client);
      const row = await db.tasks.where("guid").equals("g2").first();
      expect(row!.title).toBe("local-newer");
    });

    it("advances the pull cursor to the max updated_at seen", async () => {
      const { client } = makeMockClient("u1");
      await client.upsert("tasks", [{
        guid: "g3", user_id: "u1", title: "x", links: [], project_guid: null,
        bucket: "today", status: "todo", order: 0, created_at: 1,
        completed_at: null, due: null, due_has_time: false, subtasks: [],
        carried: false, day_key: null, archived: false, archived_at: null,
        updated_at: 777, deleted_at: null,
      }]);
      await pullTable("tasks", client);
      expect(await getPullCursor("tasks")).toBe(777);
    });

    it("applies a remote tombstone by deleting the local row", async () => {
      const { client } = makeMockClient("u1");
      await db.tasks.add({
        guid: "g4", title: "to-delete", links: [], projectId: null,
        bucket: "today", status: "todo", order: 0, createdAt: 1,
        completedAt: null, due: null, dueHasTime: false, subtasks: [],
        carried: false, dayKey: null, archived: false, archivedAt: null,
        updatedAt: 100, deletedAt: null,
      });
      await client.upsert("tasks", [{
        guid: "g4", user_id: "u1", title: "to-delete", links: [],
        project_guid: null, bucket: "today", status: "todo", order: 0,
        created_at: 1, completed_at: null, due: null, due_has_time: false,
        subtasks: [], carried: false, day_key: null, archived: false,
        archived_at: null, updated_at: 900, deleted_at: 900,
      }]);
      await pullTable("tasks", client);
      const row = await db.tasks.where("guid").equals("g4").first();
      expect(row).toBeUndefined();
    });
  });

  describe("migrateInitial + verifyCounts", () => {
    it("pushes everything and verifies local==remote live counts", async () => {
      const { client } = makeMockClient("u1");
      await db.projects.add({
        guid: "p1", name: "Cadence", kind: "active", color: "#A9C8EE",
        order: 0, createdAt: 1, archivedAt: null, updatedAt: 10, deletedAt: null,
      });
      await db.tasks.add({
        guid: "t1", title: "a", links: [], projectId: 1, bucket: "today",
        status: "todo", order: 0, createdAt: 1, completedAt: null, due: null,
        dueHasTime: false, subtasks: [], carried: false, dayKey: null,
        archived: false, archivedAt: null, updatedAt: 10, deletedAt: null,
      });
      const result = await migrateInitial(client, "u1");
      expect(result.ok).toBe(true);
      const counts = await verifyCounts(client);
      expect(counts.projects).toEqual({ local: 1, remote: 1 });
      expect(counts.tasks).toEqual({ local: 1, remote: 1 });
    });

    it("reports ok=false when a count mismatches", async () => {
      const { client, store } = makeMockClient("u1");
      await db.tasks.add({
        guid: "t1", title: "a", links: [], projectId: null, bucket: "today",
        status: "todo", order: 0, createdAt: 1, completedAt: null, due: null,
        dueHasTime: false, subtasks: [], carried: false, dayKey: null,
        archived: false, archivedAt: null, updatedAt: 10, deletedAt: null,
      });
      await migrateInitial(client, "u1");
      // simulate a remote row vanishing
      store.get("tasks")!.clear();
      const counts = await verifyCounts(client);
      expect(counts.tasks.local).not.toBe(counts.tasks.remote);
    });
  });
  ```
- [ ] Correr y ver fallar:
  ```bash
  pnpm vitest run lib/sync/__tests__/engine.test.ts
  ```
  Salida esperada: falla (engine no existe).
- [ ] Implementar `lib/sync/engine.ts`. Resuelve relaciones por guid leyendo la fila padre local; aplica LWW comparando `updatedAt`:
  ```ts
  import { db } from "@/lib/db/schema";
  import type { RemoteRow, SyncClient, Table } from "@/lib/sync/types";
  import { SYNC_TABLES } from "@/lib/sync/types";
  import {
    getLastPushedAt,
    setLastPushedAt,
    getPullCursor,
    setPullCursor,
    getDirtyRows,
    resetSyncCursors,
  } from "@/lib/sync/dirty";
  import * as M from "@/lib/sync/mappers";
  import type { Project, Task, Idea, BacklogItem, Photo } from "@/lib/types";

  // --- guid helpers (local id ↔ stable guid) ---
  async function projectGuidById(id: number | null | undefined): Promise<string | null> {
    if (id == null) return null;
    return (await db.projects.get(id))?.guid ?? null;
  }
  async function projectIdByGuid(guid: string | null): Promise<number | null> {
    if (!guid) return null;
    return (await db.projects.where("guid").equals(guid).first())?.id ?? null;
  }

  // --- toRemote per table (resolving relations) ---
  async function rowToRemote(
    table: Exclude<Table, "photos">,
    row: unknown,
    userId: string,
  ): Promise<RemoteRow> {
    switch (table) {
      case "projects":
        return M.projectToRemote(row as Project, userId);
      case "tasks": {
        const t = row as Task;
        return M.taskToRemote(t, userId, await projectGuidById(t.projectId));
      }
      case "ideas": {
        const i = row as Idea;
        return M.ideaToRemote(i, userId, await projectGuidById(i.projectId));
      }
      case "backlog": {
        const b = row as BacklogItem;
        return M.backlogToRemote(b, userId, await projectGuidById(b.promotedProjectId));
      }
    }
  }

  const TABLE_REF = {
    projects: () => db.projects,
    tasks: () => db.tasks,
    ideas: () => db.ideas,
    backlog: () => db.backlog,
  } as const;

  /** Push local rows changed since the last push; advance lastPushedAt on success. */
  export async function pushTable(
    table: Exclude<Table, "photos">,
    client: SyncClient,
    userId: string,
  ): Promise<void> {
    const since = await getLastPushedAt(table);
    const dirty = await getDirtyRows<{ updatedAt: number }>(table, since);
    if (dirty.length === 0) return;
    const remoteRows = await Promise.all(
      dirty.map((r) => rowToRemote(table, r, userId)),
    );
    await client.upsert(table, remoteRows);
    const maxUpdated = dirty.reduce((m, r) => Math.max(m, r.updatedAt), since);
    await setLastPushedAt(table, maxUpdated);
  }

  /** Pull remote changes since cursor; apply LWW; honor tombstones; advance cursor. */
  export async function pullTable(
    table: Exclude<Table, "photos">,
    client: SyncClient,
  ): Promise<void> {
    const cursor = await getPullCursor(table);
    const rows = await client.pullSince(table, cursor);
    if (rows.length === 0) return;
    let maxUpdated = cursor;
    for (const r of rows) {
      maxUpdated = Math.max(maxUpdated, r.updated_at);
      await applyRemoteRow(table, r);
    }
    await setPullCursor(table, maxUpdated);
  }

  async function applyRemoteRow(
    table: Exclude<Table, "photos">,
    r: RemoteRow,
  ): Promise<void> {
    const tbl = TABLE_REF[table]();
    const existing = await tbl.where("guid").equals(r.guid as string).first();
    // LWW: skip if local is strictly newer.
    if (existing && existing.updatedAt > (r.updated_at as number)) return;

    // Tombstone: delete local physically.
    if (r.deleted_at != null) {
      if (existing?.id != null) await tbl.delete(existing.id);
      return;
    }

    if (table === "projects") {
      const data = M.projectFromRemote(r);
      if (existing?.id != null) await db.projects.update(existing.id, data);
      else await db.projects.add(data as Project);
      return;
    }
    if (table === "tasks") {
      const data = M.taskFromRemote(r);
      const projectId = await projectIdByGuid(M.taskRemoteProjectGuid(r));
      const full = { ...data, projectId };
      if (existing?.id != null) await db.tasks.update(existing.id, full);
      else await db.tasks.add(full as Task);
      return;
    }
    if (table === "ideas") {
      const data = M.ideaFromRemote(r);
      const projectId = await projectIdByGuid(M.ideaRemoteProjectGuid(r));
      const full = { ...data, projectId: projectId ?? 0 };
      if (existing?.id != null) await db.ideas.update(existing.id, full);
      else await db.ideas.add(full as Idea);
      return;
    }
    if (table === "backlog") {
      const data = M.backlogFromRemote(r);
      const promotedProjectId = await projectIdByGuid(
        M.backlogRemotePromotedGuid(r),
      );
      const full = { ...data, promotedProjectId };
      if (existing?.id != null) await db.backlog.update(existing.id, full);
      else await db.backlog.add(full as BacklogItem);
      return;
    }
  }

  /** One full pull/push cycle for the relational tables (photos handled apart). */
  export async function syncOnce(client: SyncClient, userId: string): Promise<void> {
    const relational: Exclude<Table, "photos">[] = [
      "projects",
      "tasks",
      "ideas",
      "backlog",
    ];
    // Projects first so guid→id resolution works for children on pull.
    for (const t of relational) await pullTable(t, client);
    for (const t of relational) await pushTable(t, client, userId);
  }

  export interface CountPair {
    local: number;
    remote: number;
  }
  export type CountReport = Record<Table, CountPair>;

  async function localLiveCount(table: Exclude<Table, "photos">): Promise<number> {
    const all = await TABLE_REF[table]().toArray();
    return all.filter((r) => (r as { deletedAt?: number | null }).deletedAt == null)
      .length;
  }

  /** Compare local live counts vs remote live counts, per table. */
  export async function verifyCounts(client: SyncClient): Promise<CountReport> {
    const report = {} as CountReport;
    for (const t of SYNC_TABLES) {
      const remote = await client.countLive(t);
      let local: number;
      if (t === "photos") {
        const all = await db.photos.toArray();
        local = all.filter((p) => p.deletedAt == null).length;
      } else {
        local = await localLiveCount(t);
      }
      report[t] = { local, remote };
    }
    return report;
  }

  export interface MigrateResult {
    ok: boolean;
    counts: CountReport;
  }

  /**
   * First login: force-push everything (cursor 0 = all dirty), then verify
   * counts match before declaring migration complete. On mismatch ok=false;
   * the app keeps running locally and retries later.
   */
  export async function migrateInitial(
    client: SyncClient,
    userId: string,
  ): Promise<MigrateResult> {
    await resetSyncCursors();
    const relational: Exclude<Table, "photos">[] = [
      "projects",
      "tasks",
      "ideas",
      "backlog",
    ];
    for (const t of relational) await pushTable(t, client, userId);
    // photos metadata pushed by photo queue (Task 11); blobs upload in bg.
    const counts = await verifyCounts(client);
    const ok = relational.every((t) => counts[t].local === counts[t].remote);
    return { ok, counts };
  }
  ```
- [ ] Correr hasta verde:
  ```bash
  pnpm vitest run lib/sync/__tests__/engine.test.ts
  ```
  Salida esperada: todos los tests pasan.
- [ ] **Commit:** `feat(sp4): sync engine — push/pull LWW, tombstones, initial migration (TDD)`

---

## Task 10: Adaptador real SyncClient sobre supabase-js

**Files:** `lib/sync/supabase-client-adapter.ts`

Implementa `SyncClient` con la LWW server-side. supabase-js no expone `on conflict ... where` directamente, así que el upsert usa una RPC o el patrón estándar: `upsert` con `ignoreDuplicates: false` y un filtro de `updated_at`. Para garantizar LWW exacto se define una RPC `upsert_lww` por tabla. Aquí se usa el camino simple soportado por la API: upsert por `guid` y, como el servidor confía en RLS + el cliente sólo sube filas más nuevas, el LWW se refuerza con una función SQL.

- [ ] Añadir la función LWW server-side como migración `supabase/migrations/20260605000005_upsert_lww.sql`:
  ```sql
  -- Generic LWW upsert: insert, or update only when the incoming row is newer
  -- or equal. Called once per table with a jsonb array of rows.
  create or replace function public.upsert_lww(p_table text, p_rows jsonb)
  returns setof text
  language plpgsql
  security invoker
  as $$
  declare
    r jsonb;
    cols text;
    vals text;
    set_clause text;
  begin
    for r in select * from jsonb_array_elements(p_rows)
    loop
      if p_table = 'projects' then
        insert into public.projects
          select * from jsonb_populate_record(null::public.projects, r)
        on conflict (guid) do update set
          name=excluded.name, kind=excluded.kind, color=excluded.color,
          "order"=excluded."order", archived_at=excluded.archived_at,
          updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
        where excluded.updated_at >= public.projects.updated_at;
        return next (r->>'guid');
      elsif p_table = 'tasks' then
        insert into public.tasks
          select * from jsonb_populate_record(null::public.tasks, r)
        on conflict (guid) do update set
          title=excluded.title, links=excluded.links,
          project_guid=excluded.project_guid, bucket=excluded.bucket,
          status=excluded.status, "order"=excluded."order",
          completed_at=excluded.completed_at, due=excluded.due,
          due_has_time=excluded.due_has_time, subtasks=excluded.subtasks,
          carried=excluded.carried, day_key=excluded.day_key,
          archived=excluded.archived, archived_at=excluded.archived_at,
          updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
        where excluded.updated_at >= public.tasks.updated_at;
        return next (r->>'guid');
      elsif p_table = 'ideas' then
        insert into public.ideas
          select * from jsonb_populate_record(null::public.ideas, r)
        on conflict (guid) do update set
          project_guid=excluded.project_guid, text=excluded.text,
          status=excluded.status, links=excluded.links, due=excluded.due,
          due_has_time=excluded.due_has_time, subtasks=excluded.subtasks,
          "order"=excluded."order", updated_at=excluded.updated_at,
          deleted_at=excluded.deleted_at
        where excluded.updated_at >= public.ideas.updated_at;
        return next (r->>'guid');
      elsif p_table = 'backlog' then
        insert into public.backlog
          select * from jsonb_populate_record(null::public.backlog, r)
        on conflict (guid) do update set
          title=excluded.title, note=excluded.note, links=excluded.links,
          due=excluded.due, due_has_time=excluded.due_has_time,
          subtasks=excluded.subtasks, "order"=excluded."order",
          promoted_project_guid=excluded.promoted_project_guid,
          updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
        where excluded.updated_at >= public.backlog.updated_at;
        return next (r->>'guid');
      elsif p_table = 'photos' then
        insert into public.photos
          select * from jsonb_populate_record(null::public.photos, r)
        on conflict (guid) do update set
          parent_type=excluded.parent_type, parent_guid=excluded.parent_guid,
          width=excluded.width, height=excluded.height,
          storage_path=excluded.storage_path, updated_at=excluded.updated_at,
          deleted_at=excluded.deleted_at
        where excluded.updated_at >= public.photos.updated_at;
        return next (r->>'guid');
      end if;
    end loop;
  end;
  $$;
  ```
  Nota: `jsonb_populate_record` exige que el JSON traiga `user_id` (lo añade el mapper) y `created_at`. RLS sigue aplicando porque la función es `security invoker`.
- [ ] **[MANUAL — usuario]** Aplicar la nueva migración:
  ```bash
  set -a; source .env.local; set +a
  supabase db push
  ```
  Salida esperada: `Applying migration 20260605000005_upsert_lww.sql` y `Finished`.
- [ ] Implementar el adaptador `lib/sync/supabase-client-adapter.ts`:
  ```ts
  import type { SupabaseClient } from "@supabase/supabase-js";
  import type { RemoteRow, SyncClient, Table } from "@/lib/sync/types";

  export function createSupabaseSyncClient(sb: SupabaseClient): SyncClient {
    return {
      async getUserId() {
        const { data } = await sb.auth.getUser();
        return data.user?.id ?? null;
      },

      async upsert(table: Table, rows: RemoteRow[]) {
        if (rows.length === 0) return { accepted: [] };
        const { data, error } = await sb.rpc("upsert_lww", {
          p_table: table,
          p_rows: rows,
        });
        if (error) throw error;
        // RPC returns the set of guids it processed.
        const accepted = Array.isArray(data) ? (data as string[]) : [];
        return { accepted };
      },

      async pullSince(table: Table, cursor: number) {
        const { data, error } = await sb
          .from(table)
          .select("*")
          .gt("updated_at", cursor)
          .order("updated_at", { ascending: true });
        if (error) throw error;
        return (data ?? []) as RemoteRow[];
      },

      async countLive(table: Table) {
        const { count, error } = await sb
          .from(table)
          .select("guid", { count: "exact", head: true })
          .is("deleted_at", null);
        if (error) throw error;
        return count ?? 0;
      },

      async uploadPhoto(path: string, blob: Blob) {
        const { error } = await sb.storage
          .from("photos")
          .upload(path, blob, { contentType: "image/webp", upsert: true });
        if (error) throw error;
      },

      async createSignedUrl(path: string, expiresInSec: number) {
        const { data, error } = await sb.storage
          .from("photos")
          .createSignedUrl(path, expiresInSec);
        if (error) throw error;
        return data.signedUrl;
      },
    };
  }
  ```
- [ ] Typecheck:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores.
- [ ] **Commit:** `feat(sp4): supabase SyncClient adapter + server-side LWW upsert RPC`

---

## Task 11: Cola de fotos — subida background + descarga on-demand (TDD)

**Files:** `lib/sync/photos.ts`, `lib/sync/__tests__/photos.test.ts`

- [ ] Escribir `lib/sync/__tests__/photos.test.ts` primero (cliente mockeado, fake-indexeddb):
  ```ts
  import { describe, it, expect, beforeEach, vi } from "vitest";
  import "fake-indexeddb/auto";
  import { db } from "@/lib/db/schema";
  import type { SyncClient } from "@/lib/sync/types";
  import { storagePathFor, uploadPendingPhotos, pushPhotoMetadata } from "@/lib/sync/photos";

  function mockClient(): SyncClient {
    return {
      getUserId: async () => "u1",
      upsert: vi.fn(async () => ({ accepted: [] })),
      pullSince: async () => [],
      countLive: async () => 0,
      uploadPhoto: vi.fn(async () => {}),
      createSignedUrl: async () => "https://signed/x",
    };
  }

  beforeEach(async () => {
    await db.photos.clear();
    await db.meta.clear();
  });

  describe("storagePathFor", () => {
    it("builds <user_id>/<guid>.webp", () => {
      expect(storagePathFor("u1", "g9")).toBe("u1/g9.webp");
    });
  });

  describe("uploadPendingPhotos", () => {
    it("uploads blobs whose remoteUrl is null and sets storage_path", async () => {
      const client = mockClient();
      await db.photos.add({
        guid: "g1", parentType: "task", parentGuid: "t1",
        blob: new Blob(["x"], { type: "image/webp" }),
        thumb: new Blob(["y"], { type: "image/webp" }),
        width: 10, height: 10, createdAt: 1, updatedAt: 1,
        deletedAt: null, remoteUrl: null,
      });
      await uploadPendingPhotos(client, "u1");
      expect(client.uploadPhoto).toHaveBeenCalledWith(
        "u1/g1.webp",
        expect.any(Blob),
      );
      const row = await db.photos.where("guid").equals("g1").first();
      expect(row!.remoteUrl).toBe("u1/g1.webp");
    });

    it("skips photos that already have a remoteUrl", async () => {
      const client = mockClient();
      await db.photos.add({
        guid: "g2", parentType: "task", parentGuid: "t1",
        blob: new Blob(["x"]), thumb: new Blob(["y"]), width: 10, height: 10,
        createdAt: 1, updatedAt: 1, deletedAt: null, remoteUrl: "u1/g2.webp",
      });
      await uploadPendingPhotos(client, "u1");
      expect(client.uploadPhoto).not.toHaveBeenCalled();
    });
  });

  describe("pushPhotoMetadata", () => {
    it("upserts photo metadata with the storage_path", async () => {
      const client = mockClient();
      await db.photos.add({
        guid: "g3", parentType: "idea", parentGuid: "i1",
        blob: new Blob(["x"]), thumb: new Blob(["y"]), width: 20, height: 20,
        createdAt: 5, updatedAt: 5, deletedAt: null, remoteUrl: "u1/g3.webp",
      });
      await pushPhotoMetadata(client, "u1");
      expect(client.upsert).toHaveBeenCalledWith(
        "photos",
        expect.arrayContaining([
          expect.objectContaining({
            guid: "g3",
            parent_type: "idea",
            storage_path: "u1/g3.webp",
          }),
        ]),
      );
    });
  });
  ```
- [ ] Correr y ver fallar:
  ```bash
  pnpm vitest run lib/sync/__tests__/photos.test.ts
  ```
  Salida esperada: falla (módulo no existe).
- [ ] Implementar `lib/sync/photos.ts`:
  ```ts
  import { db, getMeta, setMeta } from "@/lib/db/schema";
  import type { SyncClient } from "@/lib/sync/types";
  import { photoToRemote } from "@/lib/sync/mappers";

  export function storagePathFor(userId: string, guid: string): string {
    return `${userId}/${guid}.webp`;
  }

  /**
   * Background upload: for every local photo without a remoteUrl, push the
   * full-size blob to Storage and record its storage_path locally. Runs only
   * when online; failures are swallowed so the UI never blocks.
   */
  export async function uploadPendingPhotos(
    client: SyncClient,
    userId: string,
  ): Promise<void> {
    const pending = (await db.photos.toArray()).filter(
      (p) => p.remoteUrl == null && p.deletedAt == null,
    );
    for (const p of pending) {
      const path = storagePathFor(userId, p.guid);
      try {
        await client.uploadPhoto(path, p.blob);
        await db.photos.update(p.id!, {
          remoteUrl: path,
          updatedAt: Date.now(),
        });
      } catch {
        // leave remoteUrl null; retried on next sync tick
      }
    }
  }

  /** Push photo metadata rows (no blob) so other devices learn they exist. */
  export async function pushPhotoMetadata(
    client: SyncClient,
    userId: string,
  ): Promise<void> {
    const since = await getMeta<number>("sync.lastPushedAt.photos", 0);
    const dirty = (await db.photos.toArray()).filter(
      (p) => p.updatedAt > since,
    );
    if (dirty.length === 0) return;
    const rows = dirty.map((p) => photoToRemote(p, userId, p.remoteUrl ?? null));
    await client.upsert("photos", rows);
    const maxUpdated = dirty.reduce((m, p) => Math.max(m, p.updatedAt), since);
    await setMeta("sync.lastPushedAt.photos", maxUpdated);
  }

  /**
   * On another device: pull photo metadata, then download the blob on demand
   * via signed URL and cache it in IndexedDB so it survives offline.
   */
  export async function downloadPhotoBlob(
    client: SyncClient,
    guid: string,
  ): Promise<Blob | null> {
    const row = await db.photos.where("guid").equals(guid).first();
    if (!row || !row.remoteUrl) return null;
    if (row.blob) return row.blob; // already cached
    try {
      const url = await client.createSignedUrl(row.remoteUrl, 60 * 60);
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      await db.photos.update(row.id!, { blob });
      return blob;
    } catch {
      return null;
    }
  }
  ```
- [ ] Correr hasta verde:
  ```bash
  pnpm vitest run lib/sync/__tests__/photos.test.ts
  ```
  Salida esperada: todos los tests pasan.
- [ ] **Commit:** `feat(sp4): photo upload queue + on-demand signed-url download (TDD)`

---

## Task 12: Auth helpers + AuthGate (login solo-Google, arranque offline)

**Files:** `lib/supabase/auth.ts`, `components/auth-gate.tsx`

- [ ] Crear `lib/supabase/auth.ts`:
  ```ts
  import { getSupabase } from "@/lib/supabase/client";
  import type { Session } from "@supabase/supabase-js";

  export async function signInWithGoogle(): Promise<void> {
    const sb = getSupabase();
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  /**
   * Reads the session from localStorage WITHOUT hitting the network — lets the
   * app cold-start offline when a session was previously cached.
   */
  export async function getCachedSession(): Promise<Session | null> {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    return data.session ?? null;
  }

  export function onAuthChange(cb: (session: Session | null) => void): () => void {
    const sb = getSupabase();
    const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
    return () => data.subscription.unsubscribe();
  }

  export async function signOut(): Promise<void> {
    await getSupabase().auth.signOut();
  }
  ```
- [ ] Crear `components/auth-gate.tsx`. Login obligatorio: si no hay sesión cacheada Y hay red, muestra la pantalla solo-Google; si no hay red y no hay sesión, muestra el mensaje "sin modo anónimo"; si hay sesión cacheada, deja pasar (arranque offline OK):
  ```tsx
  "use client";

  import { useEffect, useState } from "react";
  import type { Session } from "@supabase/supabase-js";
  import { LogIn, WifiOff } from "lucide-react";
  import { getCachedSession, onAuthChange, signInWithGoogle } from "@/lib/supabase/auth";

  type GateState =
    | { kind: "loading" }
    | { kind: "authed"; session: Session }
    | { kind: "needs-login"; online: boolean };

  export function AuthGate({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<GateState>({ kind: "loading" });

    useEffect(() => {
      let mounted = true;
      (async () => {
        const session = await getCachedSession();
        if (!mounted) return;
        if (session) setState({ kind: "authed", session });
        else setState({ kind: "needs-login", online: navigator.onLine });
      })();
      const unsub = onAuthChange((session) => {
        if (!mounted) return;
        if (session) setState({ kind: "authed", session });
        else setState({ kind: "needs-login", online: navigator.onLine });
      });
      const onOnline = () =>
        setState((s) =>
          s.kind === "needs-login" ? { ...s, online: true } : s,
        );
      const onOffline = () =>
        setState((s) =>
          s.kind === "needs-login" ? { ...s, online: false } : s,
        );
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      return () => {
        mounted = false;
        unsub();
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      };
    }, []);

    if (state.kind === "loading") return null;
    if (state.kind === "authed") return <>{children}</>;

    // needs-login
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 px-8 text-center">
        <h1 className="font-[family-name:var(--font-jakarta)] text-2xl font-bold">
          Cadence
        </h1>
        {state.online ? (
          <>
            <p className="text-muted-foreground max-w-xs text-sm">
              Inicia sesión con Google para sincronizar tus tareas entre
              dispositivos.
            </p>
            <button
              onClick={() => signInWithGoogle()}
              className="bg-foreground text-background inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium"
            >
              <LogIn className="size-4" aria-hidden />
              Continuar con Google
            </button>
          </>
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-3">
            <WifiOff className="size-8" aria-hidden />
            <p className="max-w-xs text-sm">
              Necesitas conexión para iniciar sesión la primera vez. Conéctate y
              vuelve a intentarlo.
            </p>
          </div>
        )}
      </div>
    );
  }
  ```
- [ ] Typecheck:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores.
- [ ] **Commit:** `feat(sp4): google-only auth gate with offline cold-start`

---

## Task 13: Orquestador de sync — triggers, debounce, Realtime, multi-pestaña

**Files:** `lib/sync/orchestrator.ts`

Conecta el motor puro a los efectos del navegador: debounce tras write, pull en focus/online/visibilitychange, Realtime con la app visible, y un web lock para que sólo una pestaña haga push (lo simple: Web Locks API, con fallback a no-lock).

- [ ] Crear `lib/sync/orchestrator.ts`:
  ```ts
  import { getSupabase } from "@/lib/supabase/client";
  import { createSupabaseSyncClient } from "@/lib/sync/supabase-client-adapter";
  import { syncOnce, migrateInitial } from "@/lib/sync/engine";
  import { uploadPendingPhotos, pushPhotoMetadata, downloadPhotoBlob } from "@/lib/sync/photos";
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
      setState("synced");
    } catch {
      setState("pending");
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
  }

  let realtimeChannel: ReturnType<ReturnType<typeof getSupabase>["channel"]> | null = null;

  function startRealtime(): void {
    if (realtimeChannel) return;
    const sb = getSupabase();
    const ch = sb.channel("cadence-sync");
    for (const table of SYNC_TABLES) {
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
      realtimeChannel?.unsubscribe();
      realtimeChannel = null;
      started = false;
    };
  }

  export { downloadPhotoBlob };
  ```
- [ ] Typecheck:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Salida esperada: sin errores.
- [ ] **Commit:** `feat(sp4): sync orchestrator — triggers, debounce, realtime, web-lock`

---

## Task 14: Disparar scheduleSync desde las mutaciones locales

**Files:** `lib/db/queries.ts` (y `lib/db/photos.ts` si SP2 lo creó)

Cada write local debe encolar un push. Lo simple: llamar `scheduleSync()` al final de cada mutación. Como `queries.ts` es lógica de datos (no React), importar el orquestador es seguro en el cliente.

- [ ] En `lib/db/queries.ts`, importar el scheduler:
  ```ts
  import { scheduleSync } from "@/lib/sync/orchestrator";
  ```
- [ ] Añadir `scheduleSync();` al final de cada función mutadora exportada (`addProject`, `updateProject`, `deleteProject`, `addTask`, `toggleTask`, `updateTask`, `moveTask`, `deleteTask`, `reorderTasks`, `addIdea`, `updateIdeaText`, `deleteIdea`, `reorderIdeas`, `promoteIdeaToTask`, `addBacklog`, `deleteBacklog`, `promoteBacklogToProject`). Ejemplo en `addTask`:
  ```ts
  export async function addTask(input: { /* ... */ }): Promise<number> {
    const max = await maxTaskOrder(input.bucket);
    const id = await db.tasks.add({ /* ...existing fields incl. guid/updatedAt... */ });
    scheduleSync();
    return id;
  }
  ```
  (Aplica el mismo patrón a las demás: ejecuta la mutación, llama `scheduleSync()`, devuelve. Para SP2 photos: añade `scheduleSync()` tras add/delete de fotos.)
- [ ] Guard para entornos sin navegador (tests/SSR de export). Envolver el scheduler:
  ```ts
  // En orchestrator.ts, scheduleSync ya usa setTimeout — seguro en jsdom.
  // Si algún test puro de queries no quiere disparar sync, mockea el módulo:
  //   vi.mock("@/lib/sync/orchestrator", () => ({ scheduleSync: () => {} }));
  ```
- [ ] Correr toda la suite (las mutaciones no deben romper por el sync schedule):
  ```bash
  pnpm vitest run
  ```
  Salida esperada: verde. Si algún test de queries de SP1 falla por el import, añade el `vi.mock` indicado.
- [ ] **Commit:** `feat(sp4): schedule sync after each local mutation`

---

## Task 15: UI — SyncStatus en header + montar AuthGate y startSync

**Files:** `components/sync-status.tsx`, `app/layout.tsx`, `components/app-shell.tsx`

- [ ] Crear `components/sync-status.tsx` (icono lucide, sin emojis):
  ```tsx
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
      offline: { Icon: CloudOff, label: "Sin conexión", cls: "text-muted-foreground" },
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
  ```
- [ ] Montar `startSync()` en el boot de `components/app-shell.tsx` (junto al seed/rollover existente) y devolver su cleanup:
  ```tsx
  "use client";

  import { useEffect } from "react";
  import { runRollover } from "@/lib/db/rollover";
  import { seedIfEmpty } from "@/lib/db/seed";
  import { startSync } from "@/lib/sync/orchestrator";

  let booted: Promise<void> | null = null;
  function boot() {
    if (!booted) {
      booted = (async () => {
        await seedIfEmpty();
        await runRollover();
      })();
    }
    return booted;
  }

  export function AppShell({ children }: { children: React.ReactNode }) {
    useEffect(() => {
      let stop = () => {};
      boot().then(() => {
        stop = startSync();
      });
      return () => stop();
    }, []);
    return <>{children}</>;
  }
  ```
- [ ] Envolver el árbol con `AuthGate` en `app/layout.tsx` (dentro de `AppShell`, alrededor del contenido) y colocar `SyncStatus` en el header. Mínimo:
  ```tsx
  import { AuthGate } from "@/components/auth-gate";
  import { SyncStatus } from "@/components/sync-status";
  // ...
  <AppShell>
    <AuthGate>
      <div className="mx-auto flex h-dvh max-w-md flex-col md:max-w-3xl md:flex-row xl:max-w-5xl">
        <BottomNav />
        <main className="order-first min-w-0 flex-1 overflow-y-auto overscroll-contain md:order-none">
          {children}
        </main>
      </div>
    </AuthGate>
  </AppShell>
  ```
  (Coloca `<SyncStatus />` en el header existente de cada vista o en el sidebar de SP3. Si no hay un header global, añádelo al `BottomNav`/topbar donde encaje con el diseño — un sólo punto, esquina superior derecha.)
- [ ] Typecheck + lint + build de export (verifica que static export no se rompió):
  ```bash
  pnpm exec tsc --noEmit && pnpm lint && pnpm build
  ```
  Salida esperada: build OK, genera `out/`, sin errores de "API route not supported in export".
- [ ] **Commit:** `feat(sp4): sync status indicator + mount auth gate and sync triggers`

---

## Task 16: Cobertura de tests + verificación de la suite completa

**Files:** `vitest.config.ts` (umbral de cobertura para `lib/sync`)

- [ ] Asegurar que el coverage cubre el motor de sync. En `vitest.config.ts` (creado en SP1), añadir/confirmar:
  ```ts
  // dentro de defineConfig({ test: { ... } })
  coverage: {
    provider: "v8",
    include: ["lib/sync/**"],
    thresholds: { lines: 85, functions: 85, branches: 75 },
  },
  ```
- [ ] Correr la suite con cobertura:
  ```bash
  pnpm vitest run --coverage
  ```
  Salida esperada: todos los tests de `mappers`, `engine`, `photos` (y los de SP1/SP2) en verde; cobertura de `lib/sync` por encima de los umbrales.
- [ ] **Commit:** `test(sp4): sync engine coverage thresholds`

---

## Task 17: [MANUAL — usuario] Verificación de integración real (multi-dispositivo)

**Files:** ninguno; checklist operativo contra el proyecto Supabase real.

Ejecutar tras desplegar a Vercel (preview con las env configuradas en Task 5).

- [ ] **[MANUAL — usuario] Primer login con datos seed.** Abre la app en un navegador limpio con datos locales (seed). Inicia sesión con Google. Tras el login, verifica en el dashboard de Supabase (**Table Editor**) que `projects`, `tasks`, `ideas`, `backlog` tienen el mismo número de filas vivas que localmente. El indicador de header debe quedar en *synced* (Check verde).
- [ ] **[MANUAL — usuario] Editar en un dispositivo → reflejo en otro.** Abre la app en dos navegadores (A y B), ambos logueados con la misma cuenta. En A, cambia el título de una tarea. En B, vuelve a la pestaña (focus). El cambio aparece (pull en focus + Realtime con app visible).
- [ ] **[MANUAL — usuario] Modo avión.** Activa modo avión en un dispositivo. Crea/edita/borra tareas: todo funciona (Dexie). El indicador pasa a *offline* (CloudOff). Desactiva modo avión: el indicador vuelve a *pending* y luego *synced*; los cambios suben.
- [ ] **[MANUAL — usuario] Tombstones.** Borra una tarea en A. En B (focus), la tarea desaparece (tombstone propagado, borrado físico local).
- [ ] **[MANUAL — usuario] Fotos cross-device.** Adjunta una foto a una tarea en A. Espera a que suba (indicador synced). En B, abre la tarea: la miniatura se descarga on-demand (signed URL) y se cachea.
- [ ] **[MANUAL — usuario] Sin red en primer login.** En un navegador limpio sin sesión y sin red, abre la app: aparece el mensaje "Necesitas conexión para iniciar sesión la primera vez" (WifiOff), no la app.
- [ ] **[MANUAL — usuario] Token expirado offline.** Con sesión cacheada, sin red, recarga: la app arranca y es plenamente funcional en local.
- [ ] **Sin commit** (verificación). Registrar cualquier defecto encontrado como follow-up.

---

## Task 18: [MANUAL — usuario] Registrar setup en SETUP.md y samu-flow

**Files:** `~/code/SETUP.md` y repo `~/code/personal/samu-flow` (fuera de este repo).

- [ ] **[MANUAL — usuario]** Añadir a `~/code/SETUP.md` una entrada para el proyecto Supabase de Cadence: cuenta separada, project ref, que el token vive en `.env.local` del repo (gitignored) y NO en la sesión global del CLI, y las env de Vercel.
- [ ] **[MANUAL — usuario]** Sincronizar la copia de `SETUP.md` en `~/code/personal/samu-flow`, commit + push en ese repo (cuenta GitHub personal).
- [ ] **Sin commit en este repo.**

---

## Notas de cierre

- **Static export intacto:** ninguna tarea añade `app/api/**` ni `middleware.ts`; `next.config.ts` conserva `output: "export"`. El build de export se valida en la Task 15.
- **Orden de sync importa:** en pull se procesan `projects` antes que sus hijos para que la resolución `guid→id` funcione; en push el orden es indiferente (LWW por fila).
- **Idempotencia:** reejecutar `migrateInitial` es seguro (resetea cursores y reempuja; el servidor ignora filas no más nuevas). El flag `sync.migrated` evita repetirla salvo fallo.
- **Red de seguridad:** el export JSON de SP1 sigue disponible en Settings; si la migración reporta `ok=false`, la app sigue 100% local y reintenta en el siguiente trigger.
```