alter table public.event_accommodation_offers
  add column if not exists features jsonb not null default '[]'::jsonb;

alter table public.event_accommodation_offers
  drop constraint if exists event_accommodation_features_check;

alter table public.event_accommodation_offers
  add constraint event_accommodation_features_check
  check (jsonb_typeof(features) = 'array');
