alter table public.event_accommodation_offers
  add column if not exists lodging_types jsonb not null default '[]'::jsonb;

alter table public.event_accommodation_offers
  drop constraint if exists event_accommodation_lodging_types_check;

alter table public.event_accommodation_offers
  add constraint event_accommodation_lodging_types_check
  check (jsonb_typeof(lodging_types) = 'array');
