alter table public.registrations
  add column if not exists has_disability boolean not null default false,
  add column if not exists does_indoor_workouts boolean not null default false;

alter table public.clubs
  add column if not exists presence_towns text[] not null default '{}';

comment on column public.clubs.presence_towns is
  'Town/city/district names where the club has presence; used for registration recommendations.';
