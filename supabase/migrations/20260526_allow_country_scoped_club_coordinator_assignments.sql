begin;

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

  if v_role_name in ('country_admin', 'country_coordinator') and p_country_code is null then
    return false;
  end if;

  -- Club coordinator requests may be country-scoped while the coordinator is
  -- being approved to create/manage a club profile. Existing club coordinators
  -- can still be scoped directly to a club_id.
  if v_role_name = 'club_coordinator' and p_club_id is null and p_country_code is null then
    return false;
  end if;

  if v_role_name = 'event_organizer' and p_organizer_id is null then
    return false;
  end if;

  return true;
end;
$$;

commit;
