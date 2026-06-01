update public.role_activities
set activity = replace(activity, 'Motivation' || ' Speaker', 'Empowerment Coach')
where activity ilike '%' || 'Motivation' || ' Speaker' || '%';

update public.role_activities
set activity = replace(activity, 'motivational', 'empowerment')
where role_id in (
  select role_id
  from public.roles
  where role_name = 'magazine_columnist_motivation_speaker'
)
and activity ilike '%motivational%';
