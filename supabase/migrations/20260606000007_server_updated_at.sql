-- Pull cursor must reflect WHEN the server received a row, not when the
-- client last edited it: a device that uploads old rows late would otherwise
-- be invisible to devices whose cursor already advanced past those stamps.
--
-- NOTE on upsert_lww compatibility (no changes needed to that RPC):
--
-- The existing upsert_lww RPC uses `select * from jsonb_populate_record(null::public.<t>, r)`.
-- The client never sends server_updated_at, so jsonb_populate_record produces NULL for
-- that column.  The triggers below are BEFORE INSERT / BEFORE UPDATE, so they fire in
-- time to stamp the value before the row lands:
--
--   INSERT path: jsonb_populate_record yields server_updated_at = NULL; the BEFORE INSERT
--     trigger overwrites it with clock_timestamp() before the row is written. ✓
--
--   UPDATE path (on-conflict DO UPDATE): the SET clause in upsert_lww does NOT include
--     server_updated_at, so excluded.server_updated_at is NULL and the column would inherit
--     the excluded value — but the BEFORE UPDATE trigger fires first and stamps it with the
--     current clock before the row is written. ✓
--
--   LWW WHERE suppresses the UPDATE: when `excluded.updated_at < public.<t>.updated_at`,
--     Postgres skips the update entirely — no BEFORE UPDATE trigger fires, and
--     server_updated_at on the winning row is left intact. ✓
--
-- Because server_updated_at is added at the END of each table definition, the positional
-- `select *` in jsonb_populate_record maps all existing columns correctly; the new column
-- simply receives NULL from the JSON and gets stamped by the trigger. ✓
--
-- The new column is added with a non-null default so existing rows get a meaningful value.

-- Shared trigger function (single definition, reused by all tables)
create or replace function public.stamp_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := (extract(epoch from clock_timestamp())*1000)::bigint;
  return new;
end;
$$;

-- ---- projects ----
alter table public.projects
  add column server_updated_at bigint not null
    default (extract(epoch from clock_timestamp())*1000)::bigint;

create trigger projects_stamp_server_updated_at
  before insert or update on public.projects
  for each row execute function public.stamp_server_updated_at();

create index projects_user_server_updated_idx
  on public.projects (user_id, server_updated_at);

-- ---- tasks ----
alter table public.tasks
  add column server_updated_at bigint not null
    default (extract(epoch from clock_timestamp())*1000)::bigint;

create trigger tasks_stamp_server_updated_at
  before insert or update on public.tasks
  for each row execute function public.stamp_server_updated_at();

create index tasks_user_server_updated_idx
  on public.tasks (user_id, server_updated_at);

-- ---- ideas ----
alter table public.ideas
  add column server_updated_at bigint not null
    default (extract(epoch from clock_timestamp())*1000)::bigint;

create trigger ideas_stamp_server_updated_at
  before insert or update on public.ideas
  for each row execute function public.stamp_server_updated_at();

create index ideas_user_server_updated_idx
  on public.ideas (user_id, server_updated_at);

-- ---- backlog ----
alter table public.backlog
  add column server_updated_at bigint not null
    default (extract(epoch from clock_timestamp())*1000)::bigint;

create trigger backlog_stamp_server_updated_at
  before insert or update on public.backlog
  for each row execute function public.stamp_server_updated_at();

create index backlog_user_server_updated_idx
  on public.backlog (user_id, server_updated_at);

-- ---- photos ----
alter table public.photos
  add column server_updated_at bigint not null
    default (extract(epoch from clock_timestamp())*1000)::bigint;

create trigger photos_stamp_server_updated_at
  before insert or update on public.photos
  for each row execute function public.stamp_server_updated_at();

create index photos_user_server_updated_idx
  on public.photos (user_id, server_updated_at);
