alter table public.clubs
  add column if not exists membership_type text not null default 'free',
  add column if not exists virtual_membership_enabled boolean not null default false,
  add column if not exists meeting_point text null,
  add column if not exists meeting_time text null,
  add column if not exists activity_options text[] not null default '{}'::text[];

alter table public.clubs
  drop constraint if exists clubs_membership_type_check;

alter table public.clubs
  add constraint clubs_membership_type_check
  check (membership_type in ('free', 'paid'));

comment on column public.clubs.membership_type is 'Whether club membership is free or paid.';
comment on column public.clubs.virtual_membership_enabled is 'Whether runners outside the club country can request virtual membership.';
comment on column public.clubs.meeting_point is 'Usual physical meeting point for the club.';
comment on column public.clubs.meeting_time is 'Usual meeting day/time text for the club.';
comment on column public.clubs.activity_options is 'Club-supported activity types, such as walk, run, stairs, cycle, and treadmill.';
