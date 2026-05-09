alter table public.events
  add column if not exists event_type text not null default 'same_day',
  add column if not exists recurrence_frequency text null,
  add column if not exists recurrence_weekday integer null;

alter table public.events
  drop constraint if exists events_event_type_check,
  add constraint events_event_type_check
    check (event_type in ('same_day', 'recurring', 'multiday'));

alter table public.events
  drop constraint if exists events_recurrence_frequency_check,
  add constraint events_recurrence_frequency_check
    check (recurrence_frequency is null or recurrence_frequency in ('weekly'));

alter table public.events
  drop constraint if exists events_recurrence_weekday_check,
  add constraint events_recurrence_weekday_check
    check (recurrence_weekday is null or recurrence_weekday between 0 and 6);

update public.events
set event_type = case
  when starts_at::date = ends_at::date then 'same_day'
  else 'multiday'
end
where event_type is null or event_type = 'same_day';

create index if not exists idx_events_event_type on public.events using btree (event_type);
