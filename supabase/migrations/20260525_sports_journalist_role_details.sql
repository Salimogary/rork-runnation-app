with target_role as (
  select role_id::integer as role_id
  from public.roles
  where role_name = 'magazine_columnist_sports_journalist'
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
    ('Cover sporting events, races, tournaments, charity runs, and community fitness initiatives with clear summaries, highlights, and follow-up context.'),
    ('Write in-depth stories about athletes, clubs, fitness journeys, upcoming events, sports culture, and notable achievements across any sport making headlines.'),
    ('Follow emerging sports news, controversies, transfers, and notable performances while keeping reporting fair, accurate, respectful, and privacy-aware.'),
    ('Develop trusted relationships with athletes, clubs, event organizers, and sponsors to access credible interviews, previews, and exclusive story leads.'),
    ('Submit at least one sports report per week and no more than five reports per week unless RunNation gives prior editorial approval.')
) as details(activity);
