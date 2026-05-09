alter table public.registrations
  add column if not exists travel_country text null,
  add column if not exists travel_country_code text null,
  add column if not exists travel_start_date date null,
  add column if not exists travel_end_date date null;

create index if not exists idx_registrations_travel_country_dates
  on public.registrations using btree (travel_country_code, travel_start_date, travel_end_date)
  where travel_country_code is not null;

notify pgrst, 'reload schema';
