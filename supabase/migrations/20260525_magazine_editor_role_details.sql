with target_role as (
  select role_id::integer as role_id
  from public.roles
  where role_name = 'magazine_editor'
),
removed as (
  delete from public.role_activities
  where role_id in (select role_id from target_role)
)
insert into public.role_activities (role_id, activity)
select target_role.role_id, details.activity
from target_role
cross join (
  values
    ('Review article, pictorial, columnist, community, journalist, fitness, and empowerment submissions for grammar, clarity, tone, accuracy, consistency, and publication readiness.'),
    ('Approve, reject, return, edit, or delete magazine submissions according to RunNation editorial standards and copyright expectations.'),
    ('Handle breaking news and time-sensitive updates by quickly preparing, updating, and publishing suitable stories when needed.'),
    ('Coordinate sponsored or advertiser-supported content while protecting editorial integrity, transparency, and reader trust.'),
    ('Lead The Running Post editorial vision by shaping the magazine identity, tone, themes, content calendar, and long-term growth strategy.'),
    ('Write News column articles when needed, with the editor''s own News articles still requiring Global Admin approval before publication.')
) as details(activity);
