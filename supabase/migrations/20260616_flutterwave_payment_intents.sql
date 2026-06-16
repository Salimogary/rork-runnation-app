create table if not exists public.payment_intents (
  payment_intent_id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  purpose text not null,
  purpose_id text,
  amount numeric(12, 2) not null,
  currency text not null default 'UGX',
  status text not null default 'pending',
  provider text not null default 'flutterwave',
  provider_reference text not null unique,
  provider_charge_id text,
  provider_customer_id text,
  provider_payment_method_id text,
  payment_method text,
  phone_number text,
  checkout_url text,
  payment_instruction text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint payment_intents_purpose_check check (purpose in ('subscription', 'shop_order', 'event_enrollment', 'club_payment', 'donation')),
  constraint payment_intents_status_check check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  constraint payment_intents_amount_check check (amount > 0)
);

create index if not exists idx_payment_intents_registration_id
  on public.payment_intents(registration_id);

create index if not exists idx_payment_intents_purpose
  on public.payment_intents(purpose, purpose_id);

create index if not exists idx_payment_intents_provider_charge_id
  on public.payment_intents(provider_charge_id);

alter table public.payment_intents enable row level security;

drop policy if exists "Users can read their payment intents" on public.payment_intents;
create policy "Users can read their payment intents"
  on public.payment_intents
  for select
  using (auth.uid() = registration_id);
