create table if not exists public.family_members (
  family_member_id uuid primary key default gen_random_uuid(),
  owner_registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  member_registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  member_email text not null,
  created_at timestamptz not null default now(),
  constraint family_members_not_self check (owner_registration_id <> member_registration_id),
  constraint family_members_unique_member unique (owner_registration_id, member_registration_id)
);

create index if not exists idx_family_members_owner
on public.family_members (owner_registration_id, created_at);

alter table public.family_members enable row level security;

drop policy if exists "family_members_owner_select" on public.family_members;
create policy "family_members_owner_select"
  on public.family_members
  for select
  to authenticated
  using (owner_registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "family_members_owner_insert" on public.family_members;
create policy "family_members_owner_insert"
  on public.family_members
  for insert
  to authenticated
  with check (owner_registration_id::text = public.current_registration_id() or public.is_platform_admin());

drop policy if exists "family_members_owner_delete" on public.family_members;
create policy "family_members_owner_delete"
  on public.family_members
  for delete
  to authenticated
  using (owner_registration_id::text = public.current_registration_id() or public.is_platform_admin());
