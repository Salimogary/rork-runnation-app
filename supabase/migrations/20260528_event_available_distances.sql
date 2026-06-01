alter table public.events
  add column if not exists available_distances_km double precision[] not null default '{}'::double precision[];

update public.events
set available_distances_km = array_remove(array[
  medal_min_daily_distance,
  medal_min_cumulative_distance
], null::double precision)
where has_medal = true
  and cardinality(available_distances_km) = 0;

notify pgrst, 'reload schema';
