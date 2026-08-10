alter table public.event_accommodation_offers
  add column if not exists accommodation_name text null,
  add column if not exists location_name text null,
  add column if not exists requires_commitment_fee boolean not null default false,
  add column if not exists commitment_fee integer not null default 0,
  add column if not exists not_permitted text null;

alter table public.event_accommodation_bookings
  add column if not exists occupant_count integer not null default 1,
  add column if not exists occupants jsonb not null default '[]'::jsonb;

alter table public.event_accommodation_offers
  drop constraint if exists event_accommodation_name_check,
  drop constraint if exists event_accommodation_location_name_check,
  drop constraint if exists event_accommodation_price_integer_check,
  drop constraint if exists event_accommodation_commitment_fee_check,
  drop constraint if exists event_accommodation_not_permitted_check;

alter table public.event_accommodation_offers
  add constraint event_accommodation_name_check
  check (accommodation_name is null or length(trim(accommodation_name)) between 2 and 120),
  add constraint event_accommodation_location_name_check
  check (location_name is null or length(trim(location_name)) between 2 and 160),
  add constraint event_accommodation_price_integer_check
  check (price_per_room = trunc(price_per_room)),
  add constraint event_accommodation_commitment_fee_check
  check (commitment_fee >= 0),
  add constraint event_accommodation_not_permitted_check
  check (not_permitted is null or length(trim(not_permitted)) <= 500);

alter table public.event_accommodation_bookings
  drop constraint if exists event_accommodation_booking_occupant_count_check,
  drop constraint if exists event_accommodation_booking_occupants_check;

alter table public.event_accommodation_bookings
  add constraint event_accommodation_booking_occupant_count_check
  check (occupant_count between 1 and 100),
  add constraint event_accommodation_booking_occupants_check
  check (jsonb_typeof(occupants) = 'array');
