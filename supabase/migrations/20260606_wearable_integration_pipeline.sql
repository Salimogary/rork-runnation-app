begin;

create table if not exists public.wearable_provider_config (
  provider text primary key,
  display_name text not null,
  status text not null default 'coming_soon',
  platform text not null,
  capabilities text[] not null default '{}',
  is_enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wearable_provider_config_provider_check
    check (provider in ('health_connect', 'garmin')),
  constraint wearable_provider_config_status_check
    check (status in ('coming_soon', 'private_beta', 'available', 'paused'))
);

create table if not exists public.wearable_connections (
  wearable_connection_id uuid primary key default gen_random_uuid(),
  registration_id text not null references public.registrations(registration_id) on delete cascade,
  provider text not null references public.wearable_provider_config(provider),
  connection_status text not null default 'not_connected',
  provider_user_id text,
  granted_scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_sync_cursor text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wearable_connections_registration_provider_key
    unique (registration_id, provider),
  constraint wearable_connections_status_check
    check (connection_status in ('not_connected', 'pending', 'connected', 'expired', 'revoked', 'error'))
);

create table if not exists public.wearable_sync_records (
  wearable_sync_record_id uuid primary key default gen_random_uuid(),
  wearable_connection_id uuid not null references public.wearable_connections(wearable_connection_id) on delete cascade,
  registration_id text not null references public.registrations(registration_id) on delete cascade,
  provider text not null references public.wearable_provider_config(provider),
  provider_record_id text not null,
  record_type text not null,
  recorded_at timestamptz,
  sync_status text not null default 'received',
  normalized_payload jsonb not null default '{}'::jsonb,
  raw_payload jsonb,
  activity_id text,
  health_goal_id bigint,
  error_message text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wearable_sync_records_provider_record_key
    unique (provider, provider_record_id),
  constraint wearable_sync_records_status_check
    check (sync_status in ('received', 'normalized', 'imported', 'skipped', 'needs_review', 'failed'))
);

create index if not exists wearable_connections_registration_idx
  on public.wearable_connections (registration_id, provider);

create index if not exists wearable_sync_records_registration_recorded_idx
  on public.wearable_sync_records (registration_id, recorded_at desc);

create index if not exists wearable_sync_records_connection_status_idx
  on public.wearable_sync_records (wearable_connection_id, sync_status);

insert into public.wearable_provider_config (
  provider,
  display_name,
  status,
  platform,
  capabilities,
  is_enabled,
  configuration
)
values
  (
    'health_connect',
    'Health Connect',
    'coming_soon',
    'android',
    array['exercise', 'distance', 'steps', 'heart_rate', 'sleep', 'oxygen_saturation'],
    false,
    '{"requires_play_health_declaration": true, "background_sync": false}'::jsonb
  ),
  (
    'garmin',
    'Garmin',
    'coming_soon',
    'all',
    array['activities', 'distance', 'steps', 'heart_rate', 'sleep', 'oxygen_saturation'],
    false,
    '{"requires_developer_approval": true, "oauth_enabled": false, "webhooks_enabled": false}'::jsonb
  )
on conflict (provider) do update
set display_name = excluded.display_name,
    platform = excluded.platform,
    capabilities = excluded.capabilities,
    updated_at = now();

alter table public.wearable_provider_config enable row level security;
alter table public.wearable_connections enable row level security;
alter table public.wearable_sync_records enable row level security;

drop policy if exists "wearable_provider_config_read" on public.wearable_provider_config;
create policy "wearable_provider_config_read"
  on public.wearable_provider_config
  for select
  using (true);

comment on table public.wearable_provider_config is
  'Feature flags and readiness state for wearable providers. Providers remain disabled until compliance and API setup are complete.';

comment on column public.wearable_connections.access_token_encrypted is
  'Reserved for application-encrypted provider credentials. Never store plaintext access tokens.';

comment on table public.wearable_sync_records is
  'Provider record ledger used for deduplication, normalization, audit, and import status.';

commit;
