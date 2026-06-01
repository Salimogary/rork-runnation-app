alter table public.registrations
  add column if not exists has_smart_watch boolean not null default false;

insert into public.goals (goal_id, goal)
values (7, 'General Health')
on conflict do nothing;
