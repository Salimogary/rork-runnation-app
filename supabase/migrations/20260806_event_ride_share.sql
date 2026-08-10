create extension if not exists pgcrypto;

create table if not exists public.event_ride_offers (
  ride_offer_id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(event_id) on delete cascade,
  driver_registration_id text not null references public.registrations(registration_id) on delete cascade,
  available_seats integer not null,
  departure_town text not null,
  departure_at timestamptz not null,
  fare_per_seat numeric(12,2) not null default 0,
  car_type text not null,
  number_plate text null,
  preferred_sex text null,
  status text not null default 'active',
  retention_until timestamptz not null default (now() + interval '18 months'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_ride_offers_seats_check check (available_seats between 1 and 12),
  constraint event_ride_offers_fare_check check (fare_per_seat >= 0),
  constraint event_ride_offers_number_plate_check check (number_plate is null or length(trim(number_plate)) between 2 and 32),
  constraint event_ride_offers_preferred_sex_check check (preferred_sex is null or preferred_sex in ('Male', 'Female')),
  constraint event_ride_offers_status_check check (status in ('active', 'full', 'cancelled', 'archived'))
);

create table if not exists public.event_ride_bookings (
  ride_booking_id uuid primary key default gen_random_uuid(),
  ride_offer_id uuid not null references public.event_ride_offers(ride_offer_id) on delete cascade,
  rider_registration_id text not null references public.registrations(registration_id) on delete cascade,
  status text not null default 'pending',
  security_retention_until timestamptz not null default (now() + interval '18 months'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_ride_bookings_status_check check (status in ('pending', 'confirmed', 'rejected', 'withdrawn', 'cancelled', 'archived'))
);

create unique index if not exists idx_event_ride_bookings_one_open_request
  on public.event_ride_bookings (ride_offer_id, rider_registration_id)
  where status in ('pending', 'confirmed');

create index if not exists idx_event_ride_offers_event_status
  on public.event_ride_offers (event_id, status, departure_at);

create index if not exists idx_event_ride_offers_driver
  on public.event_ride_offers (driver_registration_id, created_at desc);

create index if not exists idx_event_ride_bookings_offer_status
  on public.event_ride_bookings (ride_offer_id, status);

create index if not exists idx_event_ride_bookings_rider
  on public.event_ride_bookings (rider_registration_id, created_at desc);

comment on table public.event_ride_offers is
  'Cars offered by RunNation users for event ride sharing. Driver identity and vehicle plate are retained for safety review.';

comment on table public.event_ride_bookings is
  'Ride-share requests and confirmed rider-driver links retained temporarily for safety and security follow-up.';
