create table if not exists public.donation_intents (
  donation_id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users (id) on delete set null,
  registration_id uuid null references public.registrations (registration_id) on delete set null,
  country_code text null references public.countries (iso_alpha2),
  amount numeric not null check (amount > 0),
  currency text not null default 'USD',
  payment_method text not null check (payment_method in ('card', 'mobile_money')),
  remarks text null,
  status text not null default 'pledged' check (status in ('pledged', 'contacted', 'paid', 'cancelled')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_donation_intents_registration_id
  on public.donation_intents using btree (registration_id);

create index if not exists idx_donation_intents_country_code
  on public.donation_intents using btree (country_code);

create index if not exists idx_donation_intents_status_created_at
  on public.donation_intents using btree (status, created_at desc);
