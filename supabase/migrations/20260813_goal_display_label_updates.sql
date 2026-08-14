update public.goals
set goal = case goal_id
  when 1 then 'Meet my exercise goals'
  when 2 then 'Loose some weight'
  when 3 then 'Work on my pace'
  when 4 then 'Get medals'
  when 5 then 'Be part in the community'
  when 6 then 'Monitor my health'
  when 7 then 'Follow an exercise plan'
  when 8 then 'Set exercise time'
  when 9 then 'Manage running Expenditure'
  else goal
end
where goal_id in (1, 2, 3, 4, 5, 6, 7, 8, 9);

update public.faq_entries
set answer = replace(answer, 'selected General Health as one of your goals', 'selected Monitor my health as one of your goals'),
    updated_at = now()
where answer like '%selected General Health as one of your goals%';

update public.faq_entries
set answer = replace(answer, 'SmartFit rank inside General Health', 'SmartFit rank inside Monitor my health'),
    updated_at = now()
where answer like '%SmartFit rank inside General Health%';
