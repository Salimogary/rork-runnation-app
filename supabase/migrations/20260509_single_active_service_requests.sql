create unique index if not exists idx_admin_invites_one_pending_per_email
  on public.admin_invites (lower(email))
  where status = 'pending';

alter table public.roles
  add column if not exists is_exclusive_admin_role boolean not null default true;

update public.roles
set is_exclusive_admin_role = false
where role_name = 'user';

update public.roles
set is_exclusive_admin_role = true
where role_name <> 'user';

alter table public.user_role_assignments
  add column if not exists is_exclusive_admin_role boolean not null default true;

update public.user_role_assignments ura
set is_exclusive_admin_role = coalesce(r.is_exclusive_admin_role, true)
from public.roles r
where r.role_id = ura.role_id;

create or replace function public.sync_user_role_assignment_exclusive_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(r.is_exclusive_admin_role, true)
  into new.is_exclusive_admin_role
  from public.roles r
  where r.role_id = new.role_id;

  if new.is_exclusive_admin_role is null then
    new.is_exclusive_admin_role := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_user_role_assignment_exclusive_flag on public.user_role_assignments;
create trigger trg_sync_user_role_assignment_exclusive_flag
  before insert or update of role_id on public.user_role_assignments
  for each row execute function public.sync_user_role_assignment_exclusive_flag();

drop index if exists public.idx_user_role_assignments_one_active_role;
drop index if exists public.idx_user_role_assignments_one_active_admin_role;

create unique index if not exists idx_user_role_assignments_one_active_admin_role
  on public.user_role_assignments (user_id)
  where is_active = true
    and is_exclusive_admin_role = true;

create unique index if not exists idx_club_membership_one_active_creator_request
  on public.club_membership_request (registration_id, request_type)
  where request_type in ('start_club', 'event_organizer')
    and status in ('pending', 'approved');
