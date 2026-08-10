create extension if not exists pgcrypto;

create table if not exists public.event_accommodation_offers (
  accommodation_offer_id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(event_id) on delete cascade,
  host_registration_id text not null references public.registrations(registration_id) on delete cascade,
  accommodation_type text not null,
  rooms_available integer not null default 1,
  location_pin text null,
  price_per_room numeric(12,2) not null default 0,
  room_description text not null,
  host_contact text not null,
  preferred_contact_method text not null default 'any',
  host_sex text null,
  preferred_guest_sex text null,
  status text not null default 'active',
  retention_until timestamptz not null default (now() + interval '18 months'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_accommodation_type_check check (accommodation_type in ('lone', 'shared')),
  constraint event_accommodation_rooms_check check (rooms_available between 1 and 100),
  constraint event_accommodation_location_pin_check check (location_pin is null or length(trim(location_pin)) between 1 and 500),
  constraint event_accommodation_price_check check (price_per_room >= 0),
  constraint event_accommodation_contact_check check (length(trim(host_contact)) between 5 and 80),
  constraint event_accommodation_contact_method_check check (preferred_contact_method in ('calls_only', 'whatsapp_only', 'any')),
  constraint event_accommodation_host_sex_check check (host_sex is null or host_sex in ('Male', 'Female')),
  constraint event_accommodation_guest_sex_check check (preferred_guest_sex is null or preferred_guest_sex in ('Male', 'Female')),
  constraint event_accommodation_status_check check (status in ('active', 'full', 'cancelled', 'hidden', 'deleted', 'archived'))
);

create table if not exists public.event_accommodation_bookings (
  accommodation_booking_id uuid primary key default gen_random_uuid(),
  accommodation_offer_id uuid not null references public.event_accommodation_offers(accommodation_offer_id) on delete cascade,
  guest_registration_id text not null references public.registrations(registration_id) on delete cascade,
  status text not null default 'pending',
  security_retention_until timestamptz not null default (now() + interval '18 months'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_accommodation_bookings_status_check check (status in ('pending', 'confirmed', 'rejected', 'withdrawn', 'cancelled', 'archived'))
);

create unique index if not exists idx_event_accommodation_one_open_request
  on public.event_accommodation_bookings (accommodation_offer_id, guest_registration_id)
  where status in ('pending', 'confirmed');

create index if not exists idx_event_accommodation_offers_event_status
  on public.event_accommodation_offers (event_id, status, created_at desc);

create index if not exists idx_event_accommodation_offers_host
  on public.event_accommodation_offers (host_registration_id, created_at desc);

create index if not exists idx_event_accommodation_bookings_offer_status
  on public.event_accommodation_bookings (accommodation_offer_id, status);

comment on table public.event_accommodation_offers is
  'Accommodation listings offered by RunNation users for specific run events.';

comment on table public.event_accommodation_bookings is
  'Accommodation booking requests and confirmed guest-host links for event stays.';
