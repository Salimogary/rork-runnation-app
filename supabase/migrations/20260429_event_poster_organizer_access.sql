begin;

create or replace function public.can_manage_event_poster_storage(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin(p_user_id)
    or public.is_country_admin(p_user_id, null::text)
    or public.is_country_coordinator(p_user_id, null::text)
    or public.is_club_coordinator(p_user_id, null::uuid)
    or public.is_event_organizer(p_user_id, null::uuid);
$$;

drop policy if exists "event_poster_admin_upload" on storage.objects;
create policy "event_poster_admin_upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event_poster'
    and public.can_manage_event_poster_storage(auth.uid())
  );

drop policy if exists "event_poster_admin_update" on storage.objects;
create policy "event_poster_admin_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'event_poster'
    and public.can_manage_event_poster_storage(auth.uid())
  )
  with check (
    bucket_id = 'event_poster'
    and public.can_manage_event_poster_storage(auth.uid())
  );

drop policy if exists "event_poster_admin_delete" on storage.objects;
create policy "event_poster_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'event_poster'
    and public.can_manage_event_poster_storage(auth.uid())
  );

drop policy if exists "event_poster_admin_list" on storage.objects;
create policy "event_poster_admin_list"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'event_poster'
    and public.can_manage_event_poster_storage(auth.uid())
  );

commit;
