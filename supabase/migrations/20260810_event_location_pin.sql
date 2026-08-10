alter table public.events
  add column if not exists event_location_pin text null;

alter table public.events
  drop constraint if exists events_event_location_pin_length_check;

alter table public.events
  add constraint events_event_location_pin_length_check
  check (
    event_location_pin is null
    or length(trim(event_location_pin)) between 1 and 500
  );

comment on column public.events.event_location_pin is
  'Optional map pin, plus code, coordinates, or location link for an event venue.';
