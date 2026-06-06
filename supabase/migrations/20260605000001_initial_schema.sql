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
