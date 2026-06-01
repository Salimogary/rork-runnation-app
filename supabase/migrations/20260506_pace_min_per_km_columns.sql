do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activities'
      and column_name = 'pace_km_h'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activities'
      and column_name = 'pace_min_per_km'
  ) then
    alter table public.activities rename column pace_km_h to pace_min_per_km;
    update public.activities
      set pace_min_per_km = case
        when pace_min_per_km > 0 then 60.0 / pace_min_per_km
        else pace_min_per_km
      end;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fitness_goal'
      and column_name = 'target_pace'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fitness_goal'
      and column_name = 'target_pace_min_per_km'
  ) then
    alter table public.fitness_goal rename column target_pace to target_pace_min_per_km;
    update public.fitness_goal
      set target_pace_min_per_km = case
        when target_pace_min_per_km > 0 then 60.0 / target_pace_min_per_km
        else target_pace_min_per_km
      end;
  end if;
end $$;

update public.social_posts
  set activity_data =
    (activity_data - 'pace_km_h') ||
    jsonb_build_object(
      'pace_min_per_km',
      case
        when nullif(activity_data->>'pace_km_h', '')::numeric > 0
          then 60.0 / nullif(activity_data->>'pace_km_h', '')::numeric
        else 0
      end
    )
where activity_data ? 'pace_km_h'
  and not activity_data ? 'pace_min_per_km';
