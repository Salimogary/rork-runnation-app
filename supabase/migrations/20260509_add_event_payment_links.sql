alter table public.events
  add column if not exists organizer_payment_link text null,
  add column if not exists runnation_payment_link_enabled boolean not null default false;

comment on column public.events.organizer_payment_link is
  'Optional organizer or club payment URL for paid event registration.';

comment on column public.events.runnation_payment_link_enabled is
  'Reserved for future RunNation-managed payment collection on behalf of organizers.';
