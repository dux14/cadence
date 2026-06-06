-- 20260605000003_storage_photos.sql
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Path convention: "<user_id>/<photo_guid>.webp".
-- (storage.foldername(name))[1] is the first path segment = the owner's uid.
create policy photos_storage_select on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy photos_storage_insert on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy photos_storage_update on storage.objects for update
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy photos_storage_delete on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
