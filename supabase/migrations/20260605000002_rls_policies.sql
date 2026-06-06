-- 20260605000002_rls_policies.sql
alter table public.projects enable row level security;
alter table public.tasks    enable row level security;
alter table public.ideas    enable row level security;
alter table public.backlog  enable row level security;
alter table public.photos   enable row level security;

-- One policy per (table, action). Pattern is identical across tables:
-- the row is visible/writable only when it belongs to the caller.
-- projects
create policy projects_select on public.projects for select using (user_id = (select auth.uid()));
create policy projects_insert on public.projects for insert with check (user_id = (select auth.uid()));
create policy projects_update on public.projects for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy projects_delete on public.projects for delete using (user_id = (select auth.uid()));
-- tasks
create policy tasks_select on public.tasks for select using (user_id = (select auth.uid()));
create policy tasks_insert on public.tasks for insert with check (user_id = (select auth.uid()));
create policy tasks_update on public.tasks for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy tasks_delete on public.tasks for delete using (user_id = (select auth.uid()));
-- ideas
create policy ideas_select on public.ideas for select using (user_id = (select auth.uid()));
create policy ideas_insert on public.ideas for insert with check (user_id = (select auth.uid()));
create policy ideas_update on public.ideas for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ideas_delete on public.ideas for delete using (user_id = (select auth.uid()));
-- backlog
create policy backlog_select on public.backlog for select using (user_id = (select auth.uid()));
create policy backlog_insert on public.backlog for insert with check (user_id = (select auth.uid()));
create policy backlog_update on public.backlog for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy backlog_delete on public.backlog for delete using (user_id = (select auth.uid()));
-- photos
create policy photos_select on public.photos for select using (user_id = (select auth.uid()));
create policy photos_insert on public.photos for insert with check (user_id = (select auth.uid()));
create policy photos_update on public.photos for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy photos_delete on public.photos for delete using (user_id = (select auth.uid()));
