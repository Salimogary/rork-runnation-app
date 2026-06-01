alter table public.events
  add column if not exists participant_limit integer null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_participant_limit_positive'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_participant_limit_positive
      check (participant_limit is null or participant_limit > 0);
  end if;
end $$;
