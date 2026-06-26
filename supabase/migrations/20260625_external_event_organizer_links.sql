alter table public.events
  add column if not exists external_organizer_name text null,
  add column if not exists registration_link text null;

comment on column public.events.external_organizer_name is
  'Display name for an external third-party event organizer when the event is not owned by a RunNation club or organizer profile.';

comment on column public.events.registration_link is
  'Optional external registration URL for events hosted outside RunNation.';

comment on column public.events.organizer_payment_link is
  'Optional organizer, club, or external third-party payment URL for an event.';
