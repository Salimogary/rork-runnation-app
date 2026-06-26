alter table public.fitness_goal
  add column if not exists target_bands jsonb;

alter table public.fitness_goal
  add column if not exists start_date date;
