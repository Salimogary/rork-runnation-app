insert into public.roles (role_name)
values ('chat_room_administrator')
on conflict (role_name) do nothing;

update public.roles
set is_exclusive_admin_role = true
where role_name = 'chat_room_administrator';

alter table public.user_moderation_flags
  add column if not exists suspended_until timestamptz null,
  add column if not exists suspension_status text not null default 'none',
  add column if not exists suspension_requested_by uuid null references auth.users(id) on delete set null,
  add column if not exists suspension_requested_at timestamptz null,
  add column if not exists suspension_approved_by uuid null references auth.users(id) on delete set null,
  add column if not exists suspension_approved_at timestamptz null;

alter table public.user_moderation_flags
  drop constraint if exists user_moderation_flags_suspension_status_check;

alter table public.user_moderation_flags
  add constraint user_moderation_flags_suspension_status_check
  check (suspension_status in ('none', 'pending', 'approved', 'rejected', 'expired'));

with role_activity_seed(role_name, activity) as (
  values
    (
      'chat_room_administrator',
      'Screen chat abuse reports alongside Global Admin and review reported posts, comments, screenshots, and descriptions.'
    ),
    (
      'chat_room_administrator',
      'Trace and remove harmful chat posts or comments when reports are confirmed.'
    ),
    (
      'chat_room_administrator',
      'Request username-based chat room suspensions with an end date for Global Admin approval.'
    )
)
insert into public.role_activities (role_id, activity)
select r.role_id::integer, seed.activity
from role_activity_seed seed
join public.roles r on r.role_name = seed.role_name
where not exists (
  select 1
  from public.role_activities existing
  where existing.role_id = r.role_id
    and existing.activity = seed.activity
);
