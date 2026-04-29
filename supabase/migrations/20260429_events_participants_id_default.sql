alter table public.events_participants
  alter column event_participant_id set default gen_random_uuid();
