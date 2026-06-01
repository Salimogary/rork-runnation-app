do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'registrations_dob_required'
  ) then
    alter table public.registrations
      add constraint registrations_dob_required
      check (dob is not null) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'registrations_country_required'
  ) then
    alter table public.registrations
      add constraint registrations_country_required
      check (country is not null and length(trim(country)) > 0) not valid;
  end if;
end $$;

alter table public.clubs
  add column if not exists is_special_club boolean not null default false,
  add column if not exists special_club_code text null,
  add column if not exists age_min integer null,
  add column if not exists age_max integer null,
  add column if not exists allows_treadmill_data boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clubs_special_club_code_check'
  ) then
    alter table public.clubs
      add constraint clubs_special_club_code_check
      check (
        special_club_code is null
        or special_club_code in (
          'junior_runners',
          'golden_age_runners',
          'treadmill_runners',
          'para_runners'
        )
      );
  end if;
end $$;

create unique index if not exists idx_clubs_special_club_code
  on public.clubs (special_club_code)
  where special_club_code is not null;

update public.roles
set is_exclusive_admin_role = false
where role_name in ('user', 'super_admin');

update public.user_role_assignments ura
set is_exclusive_admin_role = false
from public.roles r
where r.role_id = ura.role_id
  and r.role_name = 'super_admin';

update public.user_role_assignments ura
set is_exclusive_admin_role = false
where exists (
  select 1
  from public.user_role_assignments super_assignment
  join public.roles super_role on super_role.role_id = super_assignment.role_id
  where super_assignment.user_id = ura.user_id
    and super_assignment.is_active = true
    and super_role.role_name = 'super_admin'
);

create or replace function public.sync_user_role_assignment_exclusive_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_name text;
  v_role_is_exclusive boolean;
begin
  select r.role_name, coalesce(r.is_exclusive_admin_role, true)
  into v_role_name, v_role_is_exclusive
  from public.roles r
  where r.role_id = new.role_id;

  if v_role_name in ('user', 'super_admin') then
    new.is_exclusive_admin_role := false;
    return new;
  end if;

  if exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r on r.role_id = ura.role_id
    where ura.user_id = new.user_id
      and ura.is_active = true
      and r.role_name = 'super_admin'
  ) then
    new.is_exclusive_admin_role := false;
    return new;
  end if;

  new.is_exclusive_admin_role := v_role_is_exclusive;
  return new;
end;
$$;

drop trigger if exists trg_sync_user_role_assignment_exclusive_flag on public.user_role_assignments;
create trigger trg_sync_user_role_assignment_exclusive_flag
  before insert or update of role_id, user_id on public.user_role_assignments
  for each row execute function public.sync_user_role_assignment_exclusive_flag();

create or replace function public.ensure_coordinator_for_profile(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_existing_id text;
  v_display_name text;
  v_email text;
  v_country text;
  v_registration_id uuid;
  v_profile_pk_column text;
  v_profile_registration_column text;
  v_profile_name_expr text;
  v_registration_name text;
  v_columns text[] := array[]::text[];
  v_values text[] := array[]::text[];
  v_column record;
  v_value text;
begin
  select c.coordinator_id::text
  into v_existing_id
  from public.coordinators c
  where c.coordinator_id::text = p_user_id::text
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select u.email
  into v_email
  from auth.users u
  where u.id = p_user_id
  limit 1;

  select column_name
  into v_profile_pk_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name in ('profile_id', 'id')
  order by case column_name when 'profile_id' then 0 else 1 end
  limit 1;

  if v_profile_pk_column is not null then
    select column_name
    into v_profile_registration_column
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name in ('registration_id', 'legacy_registration_id')
    order by case column_name when 'registration_id' then 0 else 1 end
    limit 1;

    v_profile_name_expr := case
      when exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'profiles'
          and column_name = 'display_name'
      ) then 'nullif(trim(display_name), '''')'
      else 'null::text'
    end;

    if v_profile_registration_column is not null then
      execute format(
        'select %s, %I from public.profiles where %I = $1 limit 1',
        v_profile_name_expr,
        v_profile_registration_column,
        v_profile_pk_column
      )
      using p_user_id
      into v_display_name, v_registration_id;
    else
      execute format(
        'select %s from public.profiles where %I = $1 limit 1',
        v_profile_name_expr,
        v_profile_pk_column
      )
      using p_user_id
      into v_display_name;
    end if;
  end if;

  if v_registration_id is null and exists (
    select 1
    from public.registrations r
    where r.registration_id = p_user_id
  ) then
    v_registration_id := p_user_id;
  end if;

  if v_registration_id is not null then
    select nullif(trim(concat_ws(' ', r.first_name, r.other_names)), ''), r.country
    into v_registration_name, v_country
    from public.registrations r
    where r.registration_id = v_registration_id
    limit 1;
  end if;

  v_display_name := coalesce(
    nullif(trim(v_display_name), ''),
    v_registration_name,
    v_email,
    'RunNation Global Admin'
  );

  for v_column in
    select column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coordinators'
      and (
        column_name = 'coordinator_id'
        or (
          is_nullable = 'NO'
          and column_default is null
          and coalesce(is_generated, 'NEVER') = 'NEVER'
        )
      )
    order by ordinal_position
  loop
    v_columns := array_append(v_columns, format('%I', v_column.column_name));

    v_value := case
      when v_column.column_name = 'coordinator_id' then quote_literal(p_user_id::text)
      when v_column.column_name in ('profile_id', 'user_id', 'auth_user_id') then quote_literal(p_user_id::text)
      when v_column.column_name = 'registration_id' then
        case when v_registration_id is not null then quote_literal(v_registration_id::text) else quote_literal(p_user_id::text) end
      when v_column.column_name ilike '%email%' then quote_literal(coalesce(v_email, 'superadmin@runnation.local'))
      when v_column.column_name ilike '%country%' then quote_literal(coalesce(v_country, 'Global'))
      when v_column.column_name ilike '%name%' then quote_literal(coalesce(v_display_name, 'RunNation Global Admin'))
      when v_column.data_type = 'boolean' then 'true'
      when v_column.data_type like 'timestamp%' then 'now()'
      when v_column.data_type = 'date' then 'current_date'
      when v_column.data_type in ('integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real') then '0'
      when v_column.udt_name = 'uuid' then 'gen_random_uuid()'
      else quote_literal(coalesce(v_display_name, 'RunNation Global Admin'))
    end;

    v_values := array_append(v_values, v_value);
  end loop;

  execute format(
    'insert into public.coordinators (%s) values (%s)',
    array_to_string(v_columns, ', '),
    array_to_string(v_values, ', ')
  );

  return p_user_id::text;
end;
$$;

do $$
declare
  v_super_admin_user_id text;
  v_super_admin_coordinator_id text;
begin
  select ura.user_id::text
  into v_super_admin_user_id
  from public.user_role_assignments ura
  join public.roles r on r.role_id = ura.role_id
  where ura.is_active = true
    and r.role_name = 'super_admin'
  order by ura.created_at asc nulls last
  limit 1;

  if v_super_admin_user_id is null then
    raise exception 'Cannot create RunNation special clubs because no active super_admin role assignment was found.';
  end if;

  v_super_admin_coordinator_id := public.ensure_coordinator_for_profile(v_super_admin_user_id::uuid);

insert into public.clubs (
  club_id,
  club_name,
  description,
  location,
  coordinator_id,
  country,
  is_special_club,
  special_club_code,
  age_min,
  age_max,
  allows_treadmill_data,
  is_active
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Junior Runners',
    'RunNation special club for runners aged 8 to 15.',
    'Global',
    v_super_admin_coordinator_id,
    null,
    true,
    'junior_runners',
    8,
    15,
    false,
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Golden Age Runners',
    'RunNation special club for runners aged 60 and above.',
    'Global',
    v_super_admin_coordinator_id,
    null,
    true,
    'golden_age_runners',
    60,
    null,
    false,
    true
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Treadmill Runners Club',
    'RunNation special club for runners who record treadmill activity.',
    'Global',
    v_super_admin_coordinator_id,
    null,
    true,
    'treadmill_runners',
    8,
    null,
    true,
    true
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'Para Runners Club',
    'RunNation special club for people with disabilities or physical impairments.',
    'Global',
    v_super_admin_coordinator_id,
    null,
    true,
    'para_runners',
    8,
    null,
    false,
    true
  )
on conflict (special_club_code) where special_club_code is not null do update
set club_name = excluded.club_name,
    description = excluded.description,
    location = excluded.location,
    coordinator_id = coalesce(public.clubs.coordinator_id, excluded.coordinator_id),
    country = excluded.country,
    is_special_club = excluded.is_special_club,
    special_club_code = excluded.special_club_code,
    age_min = excluded.age_min,
    age_max = excluded.age_max,
    allows_treadmill_data = excluded.allows_treadmill_data,
    is_active = excluded.is_active;
end $$;

insert into public.roles (role_name)
values
  ('junior_runners_club_coordinator'),
  ('golden_age_runners_club_coordinator'),
  ('treadmill_runners_club_coordinator'),
  ('para_runners_club_coordinator')
on conflict (role_name) do nothing;

update public.roles
set is_exclusive_admin_role = true
where role_name in (
  'junior_runners_club_coordinator',
  'golden_age_runners_club_coordinator',
  'treadmill_runners_club_coordinator',
  'para_runners_club_coordinator'
);

insert into public.role_activities (role_id, activity)
select r.role_id::integer, activity
from public.roles r
cross join lateral (
  values
    ('Coordinate membership and onboarding for the special club.'),
    ('Support safe, inclusive participation and community updates.'),
    ('Escalate club needs to RunNation admins when required.')
) as activities(activity)
where r.role_name in (
  'junior_runners_club_coordinator',
  'golden_age_runners_club_coordinator',
  'treadmill_runners_club_coordinator',
  'para_runners_club_coordinator'
)
and not exists (
  select 1
  from public.role_activities existing
  where existing.role_id = r.role_id::integer
    and existing.activity = activities.activity
);
