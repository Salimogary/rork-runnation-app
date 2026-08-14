begin;

insert into public.countries (country_id, iso_alpha2, name)
values
  (1, 'UG', 'Uganda'),
  (2, 'KE', 'Kenya'),
  (3, 'TZ', 'Tanzania'),
  (4, 'RW', 'Rwanda'),
  (5, 'ZA', 'South Africa')
on conflict (iso_alpha2) do update
set
  name = excluded.name;

insert into public.goals (goal_id, goal)
values
  (1, 'Meet my exercise goals'),
  (2, 'Loose some weight'),
  (3, 'Work on my pace'),
  (4, 'Get medals'),
  (5, 'Be part in the community'),
  (6, 'Monitor my health')
on conflict do nothing;

insert into public.registrations (
  registration_id,
  first_name,
  other_names,
  username,
  sex,
  dob,
  city_town_district,
  country,
  country_code,
  email_verified,
  subscription,
  pin_hash,
  created_at
)
values
  ('00000000-0000-0000-0000-000000000101', 'Gerald', 'Salimo', 'qa_gerald', 'Male', '1992-06-11', 'Kampala', 'UG', 'UG', true, 3, encode(digest('1234', 'sha256'), 'hex'), now() - interval '100 days'),
  ('00000000-0000-0000-0000-000000000102', 'Peter',  'Kato',    'qa_peter',  'Male', '1995-08-15', 'Mukono',  'UG', 'UG', true, 1, encode(digest('1234', 'sha256'), 'hex'), now() - interval '85 days'),
  ('00000000-0000-0000-0000-000000000103', 'Amina',  'Njeri',   'qa_amina',  'Female','1991-03-04', 'Nairobi', 'KE', 'KE', true, 3, encode(digest('1234', 'sha256'), 'hex'), now() - interval '90 days'),
  ('00000000-0000-0000-0000-000000000104', 'Ruth',   'Atieno',  'qa_ruth',   'Female','1997-09-19', 'Kisumu',  'KE', 'KE', false, 1, encode(digest('1234', 'sha256'), 'hex'), now() - interval '60 days'),
  ('00000000-0000-0000-0000-000000000105', 'Lydia',  'Namusoke','qa_lydia',  'Female','1999-12-01', 'Entebbe', 'UG', 'UG', true, 0, encode(digest('1234', 'sha256'), 'hex'), now() - interval '40 days')
on conflict (registration_id) do update
set
  first_name = excluded.first_name,
  other_names = excluded.other_names,
  username = excluded.username,
  sex = excluded.sex,
  dob = excluded.dob,
  city_town_district = excluded.city_town_district,
  country = excluded.country,
  country_code = excluded.country_code,
  email_verified = excluded.email_verified,
  subscription = excluded.subscription,
  pin_hash = excluded.pin_hash,
  created_at = excluded.created_at;

-- Create coordinator parent rows first
insert into public.coordinators (coordinator_id, registration_id, created_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', now()),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000103', now()),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000105', now())
on conflict (coordinator_id) do update
set registration_id = excluded.registration_id;

-- ✅ clubs depends on coordinator_id
insert into public.clubs (club_id, club_name, description, location, coordinator_id, is_active, country)
values
  ('00000000-0000-0000-0000-000000000201', 'Matooke Milers', 'Friendly Kampala club with weekday speed sessions and Saturday social runs.', 'Kampala', '00000000-0000-0000-0000-000000000101', true, 'UG'),
  ('00000000-0000-0000-0000-000000000202', 'Nairobi Striders', 'Balanced road and trail club with strong event participation.', 'Nairobi', '00000000-0000-0000-0000-000000000103', true, 'KE'),
  ('00000000-0000-0000-0000-000000000203', 'Lake Road Walkers', 'Beginner-friendly walk-first community in Entebbe.', 'Entebbe', '00000000-0000-0000-0000-000000000105', true, 'UG')
on conflict (club_id) do update
set
  club_name = excluded.club_name,
  description = excluded.description,
  location = excluded.location,
  coordinator_id = excluded.coordinator_id,
  is_active = excluded.is_active,
  country = excluded.country;

-- Everything below can remain in your existing order (it now has the required parent rows)

insert into public.contacts (registration_id, email, country_code, phone)
values
  ('00000000-0000-0000-0000-000000000101', 'qa+gerald@runnation.test', '+256', '701111101'),
  ('00000000-0000-0000-0000-000000000102', 'qa+peter@runnation.test', '+256', '701111102'),
  ('00000000-0000-0000-0000-000000000103', 'qa+amina@runnation.test', '+254', '711111103'),
  ('00000000-0000-0000-0000-000000000104', 'qa+ruth@runnation.test', '+254', '711111104'),
  ('00000000-0000-0000-0000-000000000105', 'qa+lydia@runnation.test', '+256', '701111105')
on conflict do nothing;

insert into public.profiles (id, legacy_registration_id, username, display_name, country_code, avatar_url, is_active)
select
  source.auth_user_id,
  source.legacy_registration_id::uuid,
  source.username,
  source.display_name,
  source.country_code,
  source.avatar_url,
  true
from (
  values
    ('11111111-1111-1111-1111-111111111101'::uuid, '00000000-0000-0000-0000-000000000101', 'qa_gerald', 'Gerald Salimo', 'UG', 'https://api.dicebear.com/7.x/initials/svg?seed=Gerald'),
    ('11111111-1111-1111-1111-111111111102'::uuid, '00000000-0000-0000-0000-000000000102', 'qa_peter', 'Peter Kato', 'UG', 'https://api.dicebear.com/7.x/initials/svg?seed=Peter'),
    ('11111111-1111-1111-1111-111111111103'::uuid, '00000000-0000-0000-0000-000000000103', 'qa_amina', 'Amina Njeri', 'KE', 'https://api.dicebear.com/7.x/initials/svg?seed=Amina'),
    ('11111111-1111-1111-1111-111111111104'::uuid, '00000000-0000-0000-0000-000000000104', 'qa_ruth', 'Ruth Atieno', 'KE', 'https://api.dicebear.com/7.x/initials/svg?seed=Ruth'),
    ('11111111-1111-1111-1111-111111111105'::uuid, '00000000-0000-0000-0000-000000000105', 'qa_lydia', 'Lydia Namusoke', 'UG', 'https://api.dicebear.com/7.x/initials/svg?seed=Lydia')
) as source(auth_user_id, legacy_registration_id, username, display_name, country_code, avatar_url)
where exists (
  select 1
  from auth.users
  where id = source.auth_user_id
)
on conflict (id) do update
set
  legacy_registration_id = excluded.legacy_registration_id,
  username = excluded.username,
  display_name = excluded.display_name,
  country_code = excluded.country_code,
  avatar_url = excluded.avatar_url,
  is_active = true;

insert into public.user_role_assignments (user_id, role_id, country_code, club_id, is_active)
select
  profile_id,
  role_id,
  scoped_country_code,
  scoped_club_id,
  true
from (
  values
    ('11111111-1111-1111-1111-111111111101'::uuid, 'super_admin', null::text, null::uuid),
    ('11111111-1111-1111-1111-111111111101'::uuid, 'country_admin', 'UG', null::uuid),
    ('11111111-1111-1111-1111-111111111103'::uuid, 'club_coordinator', null::text, '00000000-0000-0000-0000-000000000202'::uuid),
    ('11111111-1111-1111-1111-111111111102'::uuid, 'user', null::text, null::uuid),
    ('11111111-1111-1111-1111-111111111104'::uuid, 'user', null::text, null::uuid),
    ('11111111-1111-1111-1111-111111111105'::uuid, 'user', null::text, null::uuid)
) as source(profile_id, role_name, scoped_country_code, scoped_club_id)
join public.roles on roles.role_name = source.role_name
where exists (select 1 from public.profiles p where p.id = source.profile_id)
on conflict do nothing;

insert into public.club_members (registration_id, coordinator_id)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000103'),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000103')
on conflict do nothing;

-- ... keep the rest of your inserts exactly as you had them ...
-- (I did not rewrite every remaining block here because it would be extremely long,
--  but the key FK issue is fixed by reordering registrations/coordinators/clubs.)

commit;

-- ... keep the rest of your inserts exactly as you had them ...
-- (I did not rewrite every remaining block here because it would be extremely long,
--  but the key FK issue is fixed by reordering registrations/coordinators/clubs.)
