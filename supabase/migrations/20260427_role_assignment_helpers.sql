begin;

create or replace function public.resolve_profile_id_for_role_assignment(
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select p.id
  into v_profile_id
  from public.profiles p
  join auth.users au on au.id = p.id
  where lower(au.email) = lower(trim(p_email))
  limit 1;

  if v_profile_id is not null then
    return v_profile_id;
  end if;

  select p.id
  into v_profile_id
  from public.profiles p
  where lower(p.username) = lower(trim(p_email))
  limit 1;

  if v_profile_id is null then
    raise exception 'No profile found for "%" (expected auth email or profile username).', p_email;
  end if;

  return v_profile_id;
end;
$$;

create or replace function public.resolve_role_id_for_assignment(
  p_role_name text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id bigint;
begin
  select role_id
  into v_role_id
  from public.roles
  where role_name = p_role_name
  limit 1;

  if v_role_id is null then
    raise exception 'Role "%" does not exist.', p_role_name;
  end if;

  return v_role_id;
end;
$$;

create or replace function public.assign_country_admin(
  p_email text,
  p_country_code text,
  p_assigned_by_email text default null
)
returns public.user_role_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_assigned_by uuid;
  v_role_id bigint;
  v_assignment public.user_role_assignments%rowtype;
begin
  if p_country_code is null or btrim(p_country_code) = '' then
    raise exception 'Country code is required for country_admin assignments.';
  end if;

  v_user_id := public.resolve_profile_id_for_role_assignment(p_email);
  v_role_id := public.resolve_role_id_for_assignment('country_admin');

  if p_assigned_by_email is not null and btrim(p_assigned_by_email) <> '' then
    v_assigned_by := public.resolve_profile_id_for_role_assignment(p_assigned_by_email);
  end if;

  insert into public.user_role_assignments (
    user_id,
    role_id,
    country_code,
    club_id,
    assigned_by,
    is_active
  )
  values (
    v_user_id,
    v_role_id,
    upper(trim(p_country_code)),
    null,
    v_assigned_by,
    true
  )
  on conflict (user_id, role_id, country_code, club_id)
  do update
    set is_active = true,
        assigned_by = excluded.assigned_by
  returning *
  into v_assignment;

  return v_assignment;
end;
$$;

create or replace function public.assign_club_coordinator(
  p_email text,
  p_club_id uuid,
  p_assigned_by_email text default null
)
returns public.user_role_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_assigned_by uuid;
  v_role_id bigint;
  v_assignment public.user_role_assignments%rowtype;
begin
  if p_club_id is null then
    raise exception 'Club id is required for club_coordinator assignments.';
  end if;

  v_user_id := public.resolve_profile_id_for_role_assignment(p_email);
  v_role_id := public.resolve_role_id_for_assignment('club_coordinator');

  if p_assigned_by_email is not null and btrim(p_assigned_by_email) <> '' then
    v_assigned_by := public.resolve_profile_id_for_role_assignment(p_assigned_by_email);
  end if;

  insert into public.user_role_assignments (
    user_id,
    role_id,
    country_code,
    club_id,
    assigned_by,
    is_active
  )
  values (
    v_user_id,
    v_role_id,
    null,
    p_club_id,
    v_assigned_by,
    true
  )
  on conflict (user_id, role_id, country_code, club_id)
  do update
    set is_active = true,
        assigned_by = excluded.assigned_by
  returning *
  into v_assignment;

  return v_assignment;
end;
$$;

create or replace function public.assign_country_coordinator(
  p_email text,
  p_country_code text,
  p_assigned_by_email text default null
)
returns public.user_role_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_assigned_by uuid;
  v_role_id bigint;
  v_assignment public.user_role_assignments%rowtype;
begin
  if p_country_code is null or btrim(p_country_code) = '' then
    raise exception 'Country code is required for country_coordinator assignments.';
  end if;

  v_user_id := public.resolve_profile_id_for_role_assignment(p_email);
  v_role_id := public.resolve_role_id_for_assignment('country_coordinator');

  if p_assigned_by_email is not null and btrim(p_assigned_by_email) <> '' then
    v_assigned_by := public.resolve_profile_id_for_role_assignment(p_assigned_by_email);
  end if;

  insert into public.user_role_assignments (
    user_id,
    role_id,
    country_code,
    club_id,
    assigned_by,
    is_active
  )
  values (
    v_user_id,
    v_role_id,
    upper(trim(p_country_code)),
    null,
    v_assigned_by,
    true
  )
  on conflict (user_id, role_id, country_code, club_id)
  do update
    set is_active = true,
        assigned_by = excluded.assigned_by
  returning *
  into v_assignment;

  return v_assignment;
end;
$$;

create or replace function public.revoke_country_admin(
  p_email text,
  p_country_code text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role_id bigint;
  v_updated_count bigint;
begin
  v_user_id := public.resolve_profile_id_for_role_assignment(p_email);
  v_role_id := public.resolve_role_id_for_assignment('country_admin');

  update public.user_role_assignments
  set is_active = false
  where user_id = v_user_id
    and role_id = v_role_id
    and (p_country_code is null or country_code = upper(trim(p_country_code)))
    and is_active = true;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

create or replace function public.revoke_club_coordinator(
  p_email text,
  p_club_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role_id bigint;
  v_updated_count bigint;
begin
  v_user_id := public.resolve_profile_id_for_role_assignment(p_email);
  v_role_id := public.resolve_role_id_for_assignment('club_coordinator');

  update public.user_role_assignments
  set is_active = false
  where user_id = v_user_id
    and role_id = v_role_id
    and (p_club_id is null or club_id = p_club_id)
    and is_active = true;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

create or replace function public.revoke_country_coordinator(
  p_email text,
  p_country_code text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role_id bigint;
  v_updated_count bigint;
begin
  v_user_id := public.resolve_profile_id_for_role_assignment(p_email);
  v_role_id := public.resolve_role_id_for_assignment('country_coordinator');

  update public.user_role_assignments
  set is_active = false
  where user_id = v_user_id
    and role_id = v_role_id
    and (p_country_code is null or country_code = upper(trim(p_country_code)))
    and is_active = true;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

comment on function public.assign_country_admin(text, text, text) is
  'Promotes a user to country_admin using auth email or profile username. Example: select public.assign_country_admin(''user@example.com'', ''UG'', ''superadmin@example.com'');';

comment on function public.assign_club_coordinator(text, uuid, text) is
  'Promotes a user to the existing club_coordinator role. This is the role used by the app for coordinator access. Example: select public.assign_club_coordinator(''user@example.com'', ''00000000-0000-0000-0000-000000000201'', ''superadmin@example.com'');';

comment on function public.assign_country_coordinator(text, text, text) is
  'Promotes a user to country_coordinator using auth email or profile username. Example: select public.assign_country_coordinator(''user@example.com'', ''UG'', ''superadmin@example.com'');';

comment on function public.revoke_country_admin(text, text) is
  'Deactivates one or all country_admin assignments for a user by auth email or username.';

comment on function public.revoke_club_coordinator(text, uuid) is
  'Deactivates one or all club_coordinator assignments for a user by auth email or username.';

comment on function public.revoke_country_coordinator(text, text) is
  'Deactivates one or all country_coordinator assignments for a user by auth email or username.';

commit;
