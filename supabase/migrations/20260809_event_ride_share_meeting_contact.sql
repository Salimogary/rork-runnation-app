alter table public.event_ride_offers
  add column if not exists departure_meeting_point text null,
  add column if not exists driver_contact text null,
  add column if not exists preferred_contact_method text not null default 'any',
  add column if not exists vehicle_type text not null default 'passenger_car_light',
  add column if not exists driver_sex text null,
  add column if not exists boot_space text not null default 'some',
  add column if not exists requires_commitment_fee boolean not null default false,
  add column if not exists commitment_fee numeric(12,2) not null default 0,
  add column if not exists moderation_reason text null,
  add column if not exists moderated_by text null,
  add column if not exists moderated_at timestamptz null;

alter table public.event_ride_offers
  drop constraint if exists event_ride_offers_seats_check;

alter table public.event_ride_offers
  add constraint event_ride_offers_seats_check
  check (available_seats between 1 and 49);

alter table public.event_ride_offers
  drop constraint if exists event_ride_offers_status_check;

alter table public.event_ride_offers
  add constraint event_ride_offers_status_check
  check (status in ('active', 'full', 'pending_approval', 'hidden', 'cancelled', 'deleted', 'archived'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_ride_offers_departure_meeting_point_check'
      and conrelid = 'public.event_ride_offers'::regclass
  ) then
    alter table public.event_ride_offers
      add constraint event_ride_offers_departure_meeting_point_check
      check (departure_meeting_point is null or length(trim(departure_meeting_point)) between 2 and 160);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_ride_offers_driver_contact_check'
      and conrelid = 'public.event_ride_offers'::regclass
  ) then
    alter table public.event_ride_offers
      add constraint event_ride_offers_driver_contact_check
      check (driver_contact is null or length(trim(driver_contact)) between 5 and 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_ride_offers_preferred_contact_method_check'
      and conrelid = 'public.event_ride_offers'::regclass
  ) then
    alter table public.event_ride_offers
      add constraint event_ride_offers_preferred_contact_method_check
      check (preferred_contact_method in ('calls_only', 'whatsapp_only', 'any'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_ride_offers_vehicle_type_check'
      and conrelid = 'public.event_ride_offers'::regclass
  ) then
    alter table public.event_ride_offers
      add constraint event_ride_offers_vehicle_type_check
      check (vehicle_type in ('passenger_car_light', 'van', 'bus'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_ride_offers_driver_sex_check'
      and conrelid = 'public.event_ride_offers'::regclass
  ) then
    alter table public.event_ride_offers
      add constraint event_ride_offers_driver_sex_check
      check (driver_sex is null or driver_sex in ('Male', 'Female'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_ride_offers_boot_space_check'
      and conrelid = 'public.event_ride_offers'::regclass
  ) then
    alter table public.event_ride_offers
      add constraint event_ride_offers_boot_space_check
      check (boot_space in ('none', 'some'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_ride_offers_commitment_fee_check'
      and conrelid = 'public.event_ride_offers'::regclass
  ) then
    alter table public.event_ride_offers
      add constraint event_ride_offers_commitment_fee_check
      check (
        commitment_fee >= 0
        and (requires_commitment_fee = false or commitment_fee > 0)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_ride_offers_moderation_reason_check'
      and conrelid = 'public.event_ride_offers'::regclass
  ) then
    alter table public.event_ride_offers
      add constraint event_ride_offers_moderation_reason_check
      check (moderation_reason is null or length(trim(moderation_reason)) between 2 and 300);
  end if;
end $$;

comment on column public.event_ride_offers.departure_meeting_point is
  'Driver-provided meeting point for a ride-share offer, for example The Local Restaurant-Kyanja.';

comment on column public.event_ride_offers.driver_contact is
  'Driver-provided ride-share contact number or contact instruction visible with the offer.';

comment on column public.event_ride_offers.preferred_contact_method is
  'Driver preference for ride-share contact: calls_only, whatsapp_only, or any.';

comment on column public.event_ride_offers.vehicle_type is
  'Ride-share vehicle category: passenger_car_light, van, or bus. App validation applies category-specific seat limits.';

comment on column public.event_ride_offers.driver_sex is
  'Driver-selected sex shown on ride-share offers for rider preference and safety context.';

comment on column public.event_ride_offers.boot_space is
  'Driver-selected luggage space hint: none or some.';

comment on column public.event_ride_offers.requires_commitment_fee is
  'Whether the driver requires a commitment fee before confirming a ride-share booking.';

comment on column public.event_ride_offers.commitment_fee is
  'Driver-entered commitment fee amount used to discourage duplicate/no-show bookings.';

comment on column public.event_ride_offers.moderation_reason is
  'Reason entered when an event organizer or admin hides or deletes a ride-share car listing.';
