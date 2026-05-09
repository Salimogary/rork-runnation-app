alter table public.events
  add column if not exists recurrence_weekdays integer[] null,
  add column if not exists recurrence_monthly_mode text null,
  add column if not exists recurrence_month_day integer null,
  add column if not exists recurrence_week_of_month integer null;

alter table public.events
  drop constraint if exists events_recurrence_frequency_check,
  add constraint events_recurrence_frequency_check
    check (recurrence_frequency is null or recurrence_frequency in ('weekly', 'monthly'));

alter table public.events
  drop constraint if exists events_recurrence_monthly_mode_check,
  add constraint events_recurrence_monthly_mode_check
    check (recurrence_monthly_mode is null or recurrence_monthly_mode in ('day_of_month', 'weekend'));

alter table public.events
  drop constraint if exists events_recurrence_month_day_check,
  add constraint events_recurrence_month_day_check
    check (recurrence_month_day is null or recurrence_month_day between 1 and 31);

alter table public.events
  drop constraint if exists events_recurrence_week_of_month_check,
  add constraint events_recurrence_week_of_month_check
    check (recurrence_week_of_month is null or recurrence_week_of_month between 1 and 5);

update public.events
set recurrence_weekdays = array[recurrence_weekday]
where event_type = 'recurring'
  and recurrence_frequency = 'weekly'
  and recurrence_weekday is not null
  and recurrence_weekdays is null;

notify pgrst, 'reload schema';
