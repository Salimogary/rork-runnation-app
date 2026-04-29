begin;

create table if not exists public.event_organizers (
  organizer_id uuid primary key default gen_random_uuid(),
  organizer_name varchar(255) not null,
  description text null,
  coordinator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  is_active boolean not null default true,
  country text null,
  constraint event_organizers_coordinator_unique unique (coordinator_id)
);

create index if not exists idx_event_organizers_country
  on public.event_organizers (country)
  where country is not null;

insert into public.roles (role_name)
values ('event_organizer')
on conflict (role_name) do nothing;

alter table public.user_role_assignments
  add column if not exists organizer_id uuid null references public.event_organizers(organizer_id) on delete cascade;

alter table public.admin_invites
  add column if not exists organizer_id uuid null references public.event_organizers(organizer_id) on delete cascade;

alter table public.events
  add column if not exists organizer uuid null references public.event_organizers(organizer_id) on delete set null;

drop index if exists idx_user_role_assignments_organizer_id;
create index if not exists idx_user_role_assignments_organizer_id
  on public.user_role_assignments (organizer_id)
  where organizer_id is not null;

drop index if exists idx_admin_invites_organizer_id;
create index if not exists idx_admin_invites_organizer_id
  on public.admin_invites (organizer_id)
  where organizer_id is not null;

alter table public.user_role_assignments
  drop constraint if exists user_role_assignments_club_country_check;

alter table public.user_role_assignments
  add constraint user_role_assignments_scope_check check (
    ((case when country_code is not null then 1 else 0 end) +
     (case when club_id is not null then 1 else 0 end) +
     (case when organizer_id is not null then 1 else 0 end)) <= 1
  );

alter table public.user_role_assignments
  drop constraint if exists unique_role_scope;

alter table public.user_role_assignments
  add constraint unique_role_scope unique nulls not distinct (user_id, role_id, country_code, club_id, organizer_id);

create or replace function public.validate_role_scope(
  p_role_id bigint,
  p_country_code text,
  p_club_id uuid,
  p_organizer_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role_name text;
  v_scope_count int;
begin
  select role_name
  into v_role_name
  from public.roles
  where role_id = p_role_id;

  if v_role_name is null then
    return false;
  end if;

  v_scope_count :=
    (case when p_country_code is not null then 1 else 0 end) +
    (case when p_club_id is not null then 1 else 0 end) +
    (case when p_organizer_id is not null then 1 else 0 end);

  if v_scope_count > 1 then
    return false;
  end if;

  if v_role_name = 'country_admin' and p_country_code is null then
    return false;
  end if;

  if v_role_name = 'country_coordinator' and p_country_code is null then
    return false;
  end if;

  if v_role_name = 'club_coordinator' and p_club_id is null then
    return false;
  end if;

  if v_role_name = 'event_organizer' and p_country_code is not null then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.enforce_user_role_assignment_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.validate_role_scope(new.role_id, new.country_code, new.club_id, new.organizer_id) then
    raise exception 'Invalid role scope for assignment';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_admin_invite_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.validate_role_scope(new.role_id, new.country_code, new.club_id, new.organizer_id) then
    raise exception 'Invalid role scope for invite';
  end if;

  return new;
end;
$$;

create or replace function public.has_role(
  p_user_id uuid,
  p_role_name text,
  p_country_code text default null,
  p_club_id uuid default null,
  p_organizer_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r on r.role_id = ura.role_id
    where ura.user_id = p_user_id
      and ura.is_active = true
      and r.role_name = p_role_name
      and (p_country_code is null or ura.country_code = p_country_code)
      and (p_club_id is null or ura.club_id = p_club_id)
      and (p_organizer_id is null or ura.organizer_id = p_organizer_id)
  );
$$;

create or replace function public.is_event_organizer(
  p_user_id uuid default auth.uid(),
  p_organizer_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(p_user_id, 'event_organizer', null, null, p_organizer_id);
$$;

create or replace function public.can_manage_role_assignment(
  p_actor_user_id uuid,
  p_target_role_id bigint,
  p_country_code text default null,
  p_club_id uuid default null,
  p_organizer_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target_role as (
    select role_name
    from public.roles
    where role_id = p_target_role_id
  )
  select
    public.is_super_admin(p_actor_user_id)
    or exists (
      select 1
      from target_role tr
      where tr.role_name = 'club_coordinator'
        and p_country_code is not null
        and public.is_country_admin(p_actor_user_id, p_country_code)
    );
$$;

create or replace function public.ensure_event_organizer_for_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_organizer_id uuid;
  v_display_name text;
  v_username text;
  v_email text;
  v_country text;
  v_organizer_name text;
begin
  select organizer_id
  into v_organizer_id
  from public.event_organizers
  where coordinator_id = p_user_id
  limit 1;

  if v_organizer_id is not null then
    return v_organizer_id;
  end if;

  select
    nullif(trim(p.display_name), ''),
    nullif(trim(p.username), ''),
    au.email,
    coalesce(nullif(trim(p.country_code), ''), nullif(trim(r.country), ''))
  into
    v_display_name,
    v_username,
    v_email,
    v_country
  from public.profiles p
  left join auth.users au on au.id = p.id
  left join public.registrations r on r.registration_id = p.legacy_registration_id
  where p.id = p_user_id;

  v_organizer_name := coalesce(
    v_display_name,
    v_username,
    split_part(coalesce(v_email, ''), '@', 1),
    'RunNation Event Organizer'
  );

  insert into public.event_organizers (
    organizer_name,
    description,
    coordinator_id,
    country
  )
  values (
    v_organizer_name,
    'Independent event organizer account',
    p_user_id,
    v_country
  )
  returning organizer_id into v_organizer_id;

  return v_organizer_id;
end;
$$;

comment on table public.event_organizers is
  'Independent event organizers with scoped admin access for publishing organizer-owned events.';

commit;
