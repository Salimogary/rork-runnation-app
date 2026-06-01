alter table public.events
  add column if not exists event_location text null;

comment on column public.events.event_location is
  'Specific event start/finish place entered by the organizer, for example Kyambogo University Sports Ground. Virtual events may leave this empty.';
