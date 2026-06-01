begin;

-- Some environments ended up with multiple RBAC helper overloads after the
-- country_coordinator and event_organizer migrations. Policies may already
-- depend on these helper signatures, so keep this migration non-destructive and
-- replace the canonical organizer-aware helpers in place.

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

  if v_role_name = 'club_coordinator' and p_club_id is null and p_country_code is null then
    return false;
  end if;

  if v_role_name = 'event_organizer' and p_organizer_id is null then
    return false;
  end if;

  return true;
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

create or replace function public.is_super_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(p_user_id, 'super_admin'::text, null::text, null::uuid, null::uuid);
$$;

create or replace function public.is_country_admin(
  p_user_id uuid default auth.uid(),
  p_country_code text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(p_user_id, 'country_admin'::text, p_country_code, null::uuid, null::uuid);
$$;

create or replace function public.is_country_coordinator(
  p_user_id uuid default auth.uid(),
  p_country_code text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(p_user_id, 'country_coordinator'::text, p_country_code, null::uuid, null::uuid);
$$;

create or replace function public.is_club_coordinator(
  p_user_id uuid default auth.uid(),
  p_club_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(p_user_id, 'club_coordinator'::text, null::text, p_club_id, null::uuid);
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
  select public.has_role(p_user_id, 'event_organizer'::text, null::text, null::uuid, p_organizer_id);
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
      where tr.role_name in ('club_coordinator', 'country_coordinator')
        and p_country_code is not null
        and public.is_country_admin(p_actor_user_id, p_country_code)
    )
    or exists (
      select 1
      from target_role tr
      where tr.role_name = 'event_organizer'
        and public.is_super_admin(p_actor_user_id)
    );
$$;

commit;
