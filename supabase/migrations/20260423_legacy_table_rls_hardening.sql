-- RLS hardening for legacy RunNation tables.
-- The backend service-role client bypasses these policies; these policies protect direct mobile-client access.

create or replace function public.current_registration_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.legacy_registration_id::text
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select
    public.is_super_admin(auth.uid())
    or public.is_country_admin(auth.uid(), null::text)
    or public.is_club_coordinator(auth.uid(), null::uuid);
$$;

alter table public.registrations enable row level security;
alter table public.contacts enable row level security;
alter table public.activities enable row level security;
alter table public.shopping_cart enable row level security;
alter table public.order_items enable row level security;
alter table public.orders_to_deliver enable row level security;
alter table public.external_activity_submissions enable row level security;
alter table public.user_photos enable row level security;
alter table public.event_enrollments enable row level security;
alter table public.club_membership_request enable row level security;

drop policy if exists "registrations_select_authenticated" on public.registrations;
create policy "registrations_select_authenticated"
  on public.registrations
  for select
  to authenticated
  using (true);

drop policy if exists "registrations_update_own_or_admin" on public.registrations;
create policy "registrations_update_own_or_admin"
  on public.registrations
  for update
  to authenticated
  using (registration_id::text = public.current_registration_id() or public.is_platform_admin())
  with check (registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "registrations_delete_own_or_admin" on public.registrations;
create policy "registrations_delete_own_or_admin"
  on public.registrations
  for delete
  to authenticated
  using (registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "contacts_select_own_or_admin" on public.contacts;
create policy "contacts_select_own_or_admin"
  on public.contacts
  for select
  to authenticated
  using (registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "contacts_write_own_or_admin" on public.contacts;
create policy "contacts_write_own_or_admin"
  on public.contacts
  for all
  to authenticated
  using (registration_id::text = public.current_registration_id() or public.is_platform_admin())
  with check (registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "activities_select_authenticated" on public.activities;
create policy "activities_select_authenticated"
  on public.activities
  for select
  to authenticated
  using (true);

drop policy if exists "activities_write_own_or_admin" on public.activities;
create policy "activities_write_own_or_admin"
  on public.activities
  for all
  to authenticated
  using (registration_id::text = public.current_registration_id() or public.is_platform_admin())
  with check (registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "shopping_cart_own" on public.shopping_cart;
create policy "shopping_cart_own"
  on public.shopping_cart
  for all
  to authenticated
  using (registration_id::text = public.current_registration_id() or public.is_platform_admin())
  with check (registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "order_items_select_own_or_admin" on public.order_items;
create policy "order_items_select_own_or_admin"
  on public.order_items
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.orders o
      where o.order_id = order_items.order_id
        and o.user_id::text = public.current_registration_id()
    )
  );

drop policy if exists "orders_to_deliver_own_or_admin" on public.orders_to_deliver;
create policy "orders_to_deliver_own_or_admin"
  on public.orders_to_deliver
  for all
  to authenticated
  using (user_id::text = public.current_registration_id() or public.is_platform_admin())
  with check (user_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "external_activity_submissions_own_or_admin" on public.external_activity_submissions;
create policy "external_activity_submissions_own_or_admin"
  on public.external_activity_submissions
  for all
  to authenticated
  using (registration_id::text = public.current_registration_id() or public.is_platform_admin())
  with check (registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "user_photos_select_authenticated" on public.user_photos;
create policy "user_photos_select_authenticated"
  on public.user_photos
  for select
  to authenticated
  using (true);

drop policy if exists "user_photos_write_own_or_admin" on public.user_photos;
create policy "user_photos_write_own_or_admin"
  on public.user_photos
  for all
  to authenticated
  using (registration_id::text = public.current_registration_id() or public.is_platform_admin())
  with check (registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "event_enrollments_own_or_admin" on public.event_enrollments;
create policy "event_enrollments_own_or_admin"
  on public.event_enrollments
  for all
  to authenticated
  using (registration_id::text = public.current_registration_id() or public.is_platform_admin())
  with check (registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "club_membership_request_own_or_admin" on public.club_membership_request;
create policy "club_membership_request_own_or_admin"
  on public.club_membership_request
  for all
  to authenticated
  using (registration_id::text = public.current_registration_id() or public.is_platform_admin())
  with check (registration_id::text = public.current_registration_id() or public.is_platform_admin());
