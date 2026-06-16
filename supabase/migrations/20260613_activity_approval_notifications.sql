create table if not exists public.activity_approval_notifications (
  notification_id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  activity_id text not null references public.activities(activity_id) on delete cascade,
  source_label text null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz null,
  unique (registration_id, activity_id)
);

create index if not exists idx_activity_approval_notifications_pending
  on public.activity_approval_notifications (registration_id, created_at desc)
  where delivered_at is null;

create table if not exists public.device_push_tokens (
  push_token text primary key,
  registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  platform text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_push_tokens_registration
  on public.device_push_tokens (registration_id);

alter table public.activity_approval_notifications enable row level security;
alter table public.device_push_tokens enable row level security;

drop policy if exists "activity_approval_notifications_own" on public.activity_approval_notifications;
create policy "activity_approval_notifications_own"
  on public.activity_approval_notifications
  for all
  to authenticated
  using (registration_id::text = public.current_registration_id())
  with check (registration_id::text = public.current_registration_id());

drop policy if exists "device_push_tokens_own" on public.device_push_tokens;
create policy "device_push_tokens_own"
  on public.device_push_tokens
  for all
  to authenticated
  using (registration_id::text = public.current_registration_id())
  with check (registration_id::text = public.current_registration_id());

do $$
begin
  alter publication supabase_realtime add table public.activity_approval_notifications;
exception
  when duplicate_object then null;
end
$$;
