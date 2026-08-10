alter table public.goals
  add column if not exists description text;

update public.goals
set description = 'Build consistency by choosing how often you want to run during a date range.'
where lower(goal) in ('keep active', 'just want to run', 'daily run');

update public.goals
set description = 'Track your target weight and log progress as your running supports healthy weight change.'
where lower(goal) in ('weight loss', 'lose weight');

update public.goals
set description = 'Set pace targets for different distances and compare each run against your target.'
where lower(goal) in ('improve fitness', 'fitness');

update public.goals
set description = 'Set a medal target for a date range and track approved internal and external race medals.'
where lower(goal) in ('earn medals', 'medals');

update public.goals
set description = 'Follow your ranking across family, club, and community leaderboards as your activities grow.'
where lower(goal) in ('compete in community', 'community');

update public.goals
set description = 'Use smartwatch-style health readings such as steps, sleep, heart rate, and SpO2 to monitor wellness.'
where lower(goal) in ('general health', 'health');

update public.goals
set description = 'Declare planned running commitments and check whether completed runs match your plan.'
where lower(goal) in ('have planned runs', 'planned runs', 'stay consistent', 'build endurance');

update public.goals
set description = 'Set preferred run time windows and see whether completed runs happened within those hours.'
where lower(goal) in ('run window', 'time management', 'time window');

update public.goals
set description = 'Set a running expense budget and track race, travel, gear, and nutrition spending against it.'
where lower(goal) in ('running budget', 'expenses', 'expense tracking');

update public.goals
set description = 'Choose this if your running goal is personal and does not fit the listed options.'
where lower(goal) = 'other';

update public.goals
set description = 'Prepare for a specific race or event by keeping your training focused and measurable.'
where lower(goal) = 'train for an event';
