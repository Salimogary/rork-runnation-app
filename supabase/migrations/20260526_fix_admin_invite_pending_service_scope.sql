begin;

create or replace function public.enforce_admin_invite_scope()
returns trigger
language plpgsql
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
  where role_id = new.role_id;

  if v_role_name is null then
    raise exception 'Invalid role scope for invite';
  end if;

  v_scope_count :=
    (case when new.country_code is not null then 1 else 0 end) +
    (case when new.club_id is not null then 1 else 0 end) +
    (case when new.organizer_id is not null then 1 else 0 end);

  if v_scope_count > 1 then
    raise exception 'Invalid role scope for invite';
  end if;

  if v_role_name in ('country_admin', 'country_coordinator') and new.country_code is null then
    raise exception 'Invalid role scope for invite';
  end if;

  -- Pending service-team requests may be scoped to a country before the final
  -- club/organizer record exists. Final assignments remain stricter in
  -- enforce_user_role_assignment_scope().
  if v_role_name = 'club_coordinator' and new.club_id is null and new.country_code is null then
    raise exception 'Invalid role scope for invite';
  end if;

  if v_role_name = 'event_organizer' and new.organizer_id is null and new.country_code is null then
    raise exception 'Invalid role scope for invite';
  end if;

  return new;
end;
$$;

commit;
