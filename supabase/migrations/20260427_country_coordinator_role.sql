begin;

insert into public.roles (role_name)
values ('country_coordinator')
on conflict (role_name) do nothing;

create or replace function public.validate_role_scope(
  p_role_id bigint,
  p_country_code text,
  p_club_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role_name text;
begin
  select role_name
  into v_role_name
  from public.roles
  where role_id = p_role_id;

  if v_role_name is null then
    return false;
  end if;

  if p_country_code is not null and p_club_id is not null then
    return false;
  end if;

  if v_role_name in ('country_admin', 'country_coordinator') and p_country_code is null then
    return false;
  end if;

  if v_role_name = 'club_coordinator' and p_club_id is null and p_country_code is null then
    return false;
  end if;

  return true;
end;
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
  select exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r on r.role_id = ura.role_id
    where ura.user_id = p_user_id
      and ura.is_active = true
      and r.role_name = 'country_coordinator'
      and (p_country_code is null or ura.country_code = p_country_code)
  );
$$;

create or replace function public.can_manage_role_assignment(
  p_actor_user_id uuid,
  p_target_role_id bigint,
  p_country_code text default null,
  p_club_id uuid default null
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
    );
$$;

drop policy if exists "role_assignments_select_country_admin_scope" on public.user_role_assignments;
create policy "role_assignments_select_country_admin_scope"
  on public.user_role_assignments
  for select
  using (
    (
      country_code is not null
      and public.is_country_admin(auth.uid(), country_code)
    )
    or (
      country_code is not null
      and public.is_country_coordinator(auth.uid(), country_code)
    )
  );

drop policy if exists "role_assignments_update_manageable" on public.user_role_assignments;
create policy "role_assignments_update_manageable"
  on public.user_role_assignments
  for update
  using (
    public.is_super_admin(auth.uid())
    or (
      country_code is not null
      and public.is_country_admin(auth.uid(), country_code)
    )
    or (
      country_code is not null
      and public.is_country_coordinator(auth.uid(), country_code)
    )
  )
  with check (
    user_id <> auth.uid()
    and (
      public.is_super_admin(auth.uid())
      or (
        country_code is not null
        and public.is_country_admin(auth.uid(), country_code)
      )
    )
  );

drop policy if exists "admin_action_logs_insert_admins" on public.admin_action_logs;
create policy "admin_action_logs_insert_admins"
  on public.admin_action_logs
  for insert
  with check (
    actor_user_id = auth.uid()
    and (
      public.is_super_admin(auth.uid())
      or public.is_country_admin(auth.uid(), target_country_code)
      or public.is_country_coordinator(auth.uid(), target_country_code)
      or public.is_club_coordinator(auth.uid(), target_club_id)
    )
  );

comment on function public.is_country_coordinator(uuid, text) is
  'Returns true when the user has an active country_coordinator assignment, optionally scoped to a specific country code.';

commit;
