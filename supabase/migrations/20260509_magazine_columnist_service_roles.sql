insert into public.roles (role_name)
values
  ('magazine_columnist_fitness_coach'),
  ('magazine_columnist_sports_journalist'),
  ('magazine_columnist_motivation_speaker')
on conflict (role_name) do nothing;

with role_activity_seed(role_name, activity) as (
  values
    (
      'magazine_columnist_fitness_coach',
      'Write practical running fitness, training, recovery, and injury-prevention columns for The Running Post.'
    ),
    (
      'magazine_columnist_fitness_coach',
      'Help readers understand safe preparation, sustainable progress, and healthy habits for running.'
    ),
    (
      'magazine_columnist_sports_journalist',
      'Write credible running news, event previews, interviews, and race-community features for The Running Post.'
    ),
    (
      'magazine_columnist_sports_journalist',
      'Support editorial quality by checking story context, names, dates, and event facts before publication.'
    ),
    (
      'magazine_columnist_motivation_speaker',
      'Write motivational columns that encourage runners to stay consistent, confident, and connected.'
    ),
    (
      'magazine_columnist_motivation_speaker',
      'Share community-focused reflections that inspire participation, resilience, and belonging.'
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
