begin;

create table if not exists public.event_listing_entitlements (
  entitlement_id uuid primary key default gen_random_uuid(),
  registration_id text not null references public.registrations(registration_id) on delete cascade,
  listing_kind text not null,
  status text not null default 'trial',
  tier text not null default 'trial',
  country_code text not null default 'UG',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '30 days'),
  started_at timestamptz null,
  expires_at timestamptz null,
  quarterly_fee_amount numeric(12, 2) not null,
  quarterly_fee_currency text not null,
  annual_fee_amount numeric(12, 2) not null,
  annual_fee_currency text not null,
  payment_reference text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_listing_entitlements_kind_check check (listing_kind in ('ride_share', 'accommodation')),
  constraint event_listing_entitlements_status_check check (status in ('trial', 'active', 'expired', 'pending')),
  constraint event_listing_entitlements_tier_check check (tier in ('trial', 'quarterly', 'annual'))
);

create unique index if not exists idx_event_listing_entitlements_registration_kind
  on public.event_listing_entitlements (registration_id, listing_kind);

create index if not exists idx_event_listing_entitlements_status_expiry
  on public.event_listing_entitlements (listing_kind, status, expires_at);

alter table public.event_ride_offers
  add column if not exists listing_entitlement_id uuid null references public.event_listing_entitlements(entitlement_id) on delete set null;

alter table public.event_accommodation_offers
  add column if not exists listing_entitlement_id uuid null references public.event_listing_entitlements(entitlement_id) on delete set null;

alter table public.payment_intents
  drop constraint if exists payment_intents_purpose_check,
  add constraint payment_intents_purpose_check
  check (purpose in ('subscription', 'shop_order', 'event_enrollment', 'club_payment', 'donation', 'listing_subscription'));

comment on table public.event_listing_entitlements is
  'Separate paid listing entitlements for event ride-share and accommodation listings. These are not RunNation membership, club membership, or shop listing payments.';

commit;
