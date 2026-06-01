insert into public.roles (role_name)
values ('magazine_editor')
on conflict (role_name) do nothing;

update public.roles
set is_exclusive_admin_role = true
where role_name = 'magazine_editor';

with role_activity_seed(role_name, activity) as (
  values
    (
      'magazine_editor',
      'Lead The Running Post magazine workflow and review all article, pictorial, community, journalist, fitness, and empowerment coach submissions.'
    ),
    (
      'magazine_editor',
      'Approve or reject magazine submissions with magazine-level authority comparable to Global Admin.'
    ),
    (
      'magazine_editor',
      'Write News column articles that must be reviewed and approved by Global Admin before publication.'
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
