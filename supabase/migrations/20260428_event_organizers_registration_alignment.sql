begin;

alter table public.event_organizers
  add column if not exists registration_id uuid null references public.registrations(registration_id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_organizers'
      and column_name = 'coordinator_id'
  ) then
    update public.event_organizers eo
    set registration_id = p.registration_id
    from public.profiles p
    where eo.registration_id is null
      and p.profile_id = eo.coordinator_id;

    alter table public.event_organizers
      drop constraint if exists event_organizers_coordinator_unique;

    alter table public.event_organizers
      drop constraint if exists event_organizers_coordinator_id_fkey;

    alter table public.event_organizers
      drop column if exists coordinator_id;
  end if;
end $$;

alter table public.event_organizers
  alter column registration_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_organizers_registration_id_key'
  ) then
    alter table public.event_organizers
      add constraint event_organizers_registration_id_key unique (registration_id);
  end if;
end $$;

create index if not exists idx_event_organizers_country
  on public.event_organizers using btree (country)
  tablespace pg_default
  where country is not null;

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
  v_registration_id uuid;
  v_organizer_name text;
begin
  select p.registration_id
  into v_registration_id
  from public.profiles p
  where p.profile_id = p_user_id;

  if v_registration_id is null then
    raise exception 'Could not resolve registration for this user.';
  end if;

  select organizer_id
  into v_organizer_id
  from public.event_organizers
  where registration_id = v_registration_id
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
  left join auth.users au on au.id = p.profile_id
  left join public.registrations r on r.registration_id = p.registration_id
  where p.profile_id = p_user_id;

  v_organizer_name := coalesce(
    v_display_name,
    v_username,
    split_part(coalesce(v_email, ''), '@', 1),
    'RunNation Event Organizer'
  );

  insert into public.event_organizers (
    organizer_name,
    description,
    registration_id,
    country
  )
  values (
    v_organizer_name,
    'Independent event organizer account',
    v_registration_id,
    v_country
  )
  returning organizer_id into v_organizer_id;

  return v_organizer_id;
end;
$$;

commit;
