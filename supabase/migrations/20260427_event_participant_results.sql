alter table public.events_participants
add column if not exists distance_km numeric(10,2);

alter table public.events_participants
add column if not exists time_seconds integer;
