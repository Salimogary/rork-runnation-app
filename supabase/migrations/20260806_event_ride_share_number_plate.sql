alter table public.event_ride_offers
  add column if not exists number_plate text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_ride_offers_number_plate_check'
      and conrelid = 'public.event_ride_offers'::regclass
  ) then
    alter table public.event_ride_offers
      add constraint event_ride_offers_number_plate_check
      check (number_plate is null or length(trim(number_plate)) between 2 and 32);
  end if;
end $$;

comment on column public.event_ride_offers.number_plate is
  'Vehicle number plate supplied by the driver for private safety and security follow-up.';
