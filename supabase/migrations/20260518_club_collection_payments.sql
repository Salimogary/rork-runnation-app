begin;

create extension if not exists pgcrypto;

create table if not exists public.club_payment_items (
  payment_id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(club_id) on delete cascade,
  created_by uuid null references public.profiles(id) on delete set null,
  title text not null,
  description text null,
  amount numeric(12, 2) not null default 0,
  currency text not null default 'UGX',
  due_date date null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_payment_items_amount_check check (amount >= 0),
  constraint club_payment_items_currency_check check (char_length(trim(currency)) between 3 and 8)
);

create table if not exists public.club_payment_records (
  record_id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.club_payment_items(payment_id) on delete cascade,
  registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  status text not null default 'unpaid',
  amount_paid numeric(12, 2) not null default 0,
  paid_at timestamptz null,
  notes text null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_payment_records_status_check check (status in ('unpaid', 'pending', 'paid', 'waived')),
  constraint club_payment_records_amount_check check (amount_paid >= 0),
  constraint club_payment_records_unique_member unique (payment_id, registration_id)
);

create table if not exists public.club_collection_withdrawal_requests (
  request_id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(club_id) on delete cascade,
  requested_by uuid null references public.profiles(id) on delete set null,
  amount numeric(12, 2) not null,
  currency text not null default 'UGX',
  destination_type text not null,
  destination_details text not null,
  status text not null default 'pending',
  admin_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_collection_withdrawal_amount_check check (amount > 0),
  constraint club_collection_withdrawal_destination_check check (destination_type in ('bank', 'mobile_money')),
  constraint club_collection_withdrawal_status_check check (status in ('pending', 'approved', 'rejected', 'paid'))
);

create index if not exists idx_club_payment_items_club_id
  on public.club_payment_items (club_id);

create index if not exists idx_club_payment_items_active
  on public.club_payment_items (club_id, is_active);

create index if not exists idx_club_payment_records_payment_id
  on public.club_payment_records (payment_id);

create index if not exists idx_club_payment_records_registration_id
  on public.club_payment_records (registration_id);

create index if not exists idx_club_collection_withdrawals_club_id
  on public.club_collection_withdrawal_requests (club_id);

comment on table public.club_payment_items is
  'Club-created collection items such as membership fees managed through RunNation.';

comment on table public.club_payment_records is
  'Per-member payment status for each club collection item.';

comment on table public.club_collection_withdrawal_requests is
  'Requests for RunNation to transfer collected club funds to a club bank or mobile money account.';

commit;
