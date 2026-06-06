-- Generic LWW upsert: insert, or update only when the incoming row is newer
-- or equal. Called once per table with a jsonb array of rows.
create or replace function public.upsert_lww(p_table text, p_rows jsonb)
returns setof text
language plpgsql
security invoker
as $$
declare
  r jsonb;
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
