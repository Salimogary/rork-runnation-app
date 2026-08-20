begin;

insert into public.roles (role_name)
values ('shop_owner')
on conflict (role_name) do nothing;

create table if not exists public.shop_owner_applications (
  application_id uuid primary key default gen_random_uuid(),
  registration_id text not null references public.registrations(registration_id) on delete cascade,
  shop_name text not null,
  country_code text not null default 'UG',
  payment_modes text[] not null default array['card']::text[],
  status text not null default 'pending',
  free_trial_started_at timestamptz not null default now(),
  free_trial_ends_at timestamptz not null default (now() + interval '30 days'),
  quarterly_fee_amount numeric(12, 2) not null,
  quarterly_fee_currency text not null,
  annual_fee_amount numeric(12, 2) not null,
  annual_fee_currency text not null,
  approved_by uuid null references public.profiles(profile_id) on delete set null,
  approved_at timestamptz null,
  rejection_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_owner_applications_status_check check (status in ('pending', 'approved', 'rejected', 'suspended')),
  constraint shop_owner_applications_payment_modes_check check (
    payment_modes <@ array['card', 'mobile_money', 'cash_on_delivery']::text[]
    and array_length(payment_modes, 1) between 1 and 3
  )
);

create unique index if not exists idx_shop_owner_applications_registration
  on public.shop_owner_applications (registration_id);

create index if not exists idx_shop_owner_applications_country_status
  on public.shop_owner_applications (country_code, status);

alter table public.catalogue
  add column if not exists seller_registration_id text null references public.registrations(registration_id) on delete set null,
  add column if not exists shop_application_id uuid null references public.shop_owner_applications(application_id) on delete set null,
  add column if not exists listing_status text not null default 'approved',
  add column if not exists is_club_apparel boolean not null default false,
  add column if not exists listing_fee_required boolean not null default false,
  add column if not exists approved_by uuid null references public.profiles(profile_id) on delete set null,
  add column if not exists approved_at timestamptz null;

alter table public.catalogue
  drop constraint if exists catalogue_listing_status_check,
  add constraint catalogue_listing_status_check check (listing_status in ('pending', 'approved', 'rejected', 'suspended'));

create index if not exists idx_catalogue_listing_status
  on public.catalogue (listing_status);

create index if not exists idx_catalogue_seller_registration
  on public.catalogue (seller_registration_id)
  where seller_registration_id is not null;

comment on table public.shop_owner_applications is
  'User shop-owner registration requests. Country shop managers and global admins approve shops before sellers can list running apparel.';

comment on column public.shop_owner_applications.payment_modes is
  'Supported seller payment modes: card, mobile_money, cash_on_delivery.';

comment on column public.catalogue.listing_status is
  'Approval status for marketplace listings. Public shop screens should show approved listings only.';

commit;
