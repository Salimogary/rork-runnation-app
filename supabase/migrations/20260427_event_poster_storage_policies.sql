begin;

drop policy if exists "event_poster_admin_upload" on storage.objects;
create policy "event_poster_admin_upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event_poster'
    and public.is_platform_admin()
  );

drop policy if exists "event_poster_admin_update" on storage.objects;
create policy "event_poster_admin_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'event_poster'
    and public.is_platform_admin()
  )
  with check (
    bucket_id = 'event_poster'
    and public.is_platform_admin()
  );

drop policy if exists "event_poster_admin_delete" on storage.objects;
create policy "event_poster_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'event_poster'
    and public.is_platform_admin()
  );

drop policy if exists "event_poster_admin_list" on storage.objects;
create policy "event_poster_admin_list"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'event_poster'
    and public.is_platform_admin()
  );

commit;
