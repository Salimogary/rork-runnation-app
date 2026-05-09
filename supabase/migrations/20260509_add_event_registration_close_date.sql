alter table public.events
  add column if not exists registration_closes_at date null;

create index if not exists idx_events_registration_closes_at
  on public.events (registration_closes_at);
