begin;

insert into public.clubs (
  club_id,
  club_name,
  description,
  location,
  coordinator_id,
  country,
  is_special_club,
  special_club_code,
  age_min,
  age_max,
  allows_treadmill_data,
  is_active
)
select
  '55555555-5555-4555-8555-555555555555',
  'SmartFit Club',
  'RunNation special club for wearable users who log smartwatch health data such as steps, heart rate, sleep, and SpO2.',
  'Global',
  c.coordinator_id,
  null,
  true,
  'smartfit_club',
  8,
  null,
  false,
  true
from public.clubs c
where c.special_club_code = 'treadmill_runners'
limit 1
on conflict (special_club_code) where special_club_code is not null do update
set club_name = excluded.club_name,
    description = excluded.description,
    location = excluded.location,
    coordinator_id = coalesce(public.clubs.coordinator_id, excluded.coordinator_id),
    country = excluded.country,
    is_special_club = excluded.is_special_club,
    special_club_code = excluded.special_club_code,
    age_min = excluded.age_min,
    age_max = excluded.age_max,
    allows_treadmill_data = excluded.allows_treadmill_data,
    is_active = excluded.is_active;

insert into public.clubs (
  club_id,
  club_name,
  description,
  location,
  coordinator_id,
  country,
  is_special_club,
  special_club_code,
  age_min,
  age_max,
  allows_treadmill_data,
  is_active
)
select
  '55555555-5555-4555-8555-555555555555',
  'SmartFit Club',
  'RunNation special club for wearable users who log smartwatch health data such as steps, heart rate, sleep, and SpO2.',
  'Global',
  c.coordinator_id,
  null,
  true,
  'smartfit_club',
  8,
  null,
  false,
  true
from public.clubs c
where c.coordinator_id is not null
limit 1
on conflict (special_club_code) where special_club_code is not null do nothing;

insert into public.roles (role_name)
values ('smartfit_club_coordinator')
on conflict (role_name) do nothing;

update public.roles
set is_exclusive_admin_role = true
where role_name = 'smartfit_club_coordinator';

commit;
