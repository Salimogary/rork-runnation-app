create extension if not exists pgcrypto;

alter table public.activities
  add column if not exists stair_session_id uuid null;

create table if not exists public.stair_buildings (
  building_id uuid primary key default gen_random_uuid(),
  building_name text not null,
  country_code text null,
  city text null,
  address_description text null,
  access_type text not null default 'public',
  company_or_property_name text null,
  qr_tag_type text not null default 'permanent_tag',
  qr_custodian_name text null,
  qr_custodian_phone text null,
  qr_custodian_email text null,
  verification_status text not null default 'pending',
  created_by text null,
  approved_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stair_buildings_verification_status_check
    check (verification_status in ('pending', 'verified', 'accepted', 'manual_review', 'rejected')),
  constraint stair_buildings_access_type_check
    check (access_type in ('public', 'private', 'club', 'corporate', 'residential', 'other')),
  constraint stair_buildings_qr_tag_type_check
    check (qr_tag_type in ('permanent_tag', 'removable_tag', 'sticker', 'other'))
);

create table if not exists public.stair_routes (
  route_id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.stair_buildings(building_id) on delete cascade,
  route_name text not null,
  stairwell_name text null,
  bottom_floor_label text not null,
  middle_floor_label text null,
  top_floor_label text not null,
  floor_segments integer not null,
  middle_checkpoint_required boolean not null default false,
  bottom_to_middle_steps integer null,
  middle_to_top_steps integer null,
  bottom_to_top_steps integer not null,
  minimum_duration_seconds integer not null default 20,
  maximum_duration_seconds integer not null default 7200,
  verification_status text not null default 'pending',
  measurement_method text null,
  measured_by text null,
  verified_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stair_routes_steps_positive_check
    check (
      floor_segments >= 3
      and bottom_to_top_steps > 0
      and (bottom_to_middle_steps is null or bottom_to_middle_steps > 0)
      and (middle_to_top_steps is null or middle_to_top_steps > 0)
    ),
  constraint stair_routes_duration_check
    check (minimum_duration_seconds > 0 and maximum_duration_seconds >= minimum_duration_seconds),
  constraint stair_routes_middle_requirement_check
    check (middle_checkpoint_required = (floor_segments > 7)),
  constraint stair_routes_segment_total_check
    check (
      (floor_segments <= 7 and bottom_to_middle_steps is null and middle_to_top_steps is null)
      or
      (floor_segments > 7 and bottom_to_middle_steps is not null and middle_to_top_steps is not null and bottom_to_top_steps = bottom_to_middle_steps + middle_to_top_steps)
    ),
  constraint stair_routes_verification_status_check
    check (verification_status in ('pending', 'verified', 'accepted', 'manual_review', 'rejected'))
);

create table if not exists public.stair_checkpoints (
  checkpoint_id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.stair_routes(route_id) on delete cascade,
  checkpoint_type text not null,
  floor_label text not null,
  qr_token_hash text not null unique,
  qr_version integer not null default 1,
  installation_status text not null default 'generated',
  is_active boolean not null default false,
  installed_by text null,
  installed_at timestamptz null,
  activated_by text null,
  activated_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint stair_checkpoints_type_check
    check (checkpoint_type in ('bottom', 'middle', 'top')),
  constraint stair_checkpoints_installation_status_check
    check (installation_status in ('generated', 'printed', 'installed', 'retired', 'lost', 'replaced'))
);

create unique index if not exists idx_stair_checkpoints_route_type_active
  on public.stair_checkpoints(route_id, checkpoint_type)
  where is_active = true;

create table if not exists public.stair_sessions (
  session_id uuid primary key default gen_random_uuid(),
  registration_id text not null,
  route_id uuid not null references public.stair_routes(route_id) on delete restrict,
  club_id text null,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  completed_ascents integer not null default 0,
  verified_ascending_steps integer not null default 0,
  total_duration_seconds integer not null default 0,
  device_platform text null,
  device_model text null,
  available_sensors jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint stair_sessions_status_check
    check (status in ('pending', 'verified', 'accepted', 'partially_verified', 'manual_review', 'rejected'))
);

create table if not exists public.stair_laps (
  lap_id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.stair_sessions(session_id) on delete cascade,
  route_id uuid not null references public.stair_routes(route_id) on delete restrict,
  selected_ascent_type text not null default 'full',
  bottom_checkpoint_id uuid null references public.stair_checkpoints(checkpoint_id) on delete restrict,
  middle_checkpoint_id uuid null references public.stair_checkpoints(checkpoint_id) on delete restrict,
  top_checkpoint_id uuid null references public.stair_checkpoints(checkpoint_id) on delete restrict,
  bottom_scanned_at timestamptz null,
  middle_scanned_at timestamptz null,
  top_scanned_at timestamptz null,
  lap_endpoint text null,
  duration_seconds integer null,
  awarded_steps integer not null default 0,
  verification_status text not null default 'pending',
  rejection_reason text null,
  created_at timestamptz not null default now(),
  constraint stair_laps_selected_ascent_type_check
    check (selected_ascent_type in ('short', 'full')),
  constraint stair_laps_endpoint_check
    check (lap_endpoint is null or lap_endpoint in ('middle', 'top')),
  constraint stair_laps_verification_status_check
    check (verification_status in ('pending', 'verified', 'accepted', 'partially_verified', 'manual_review', 'rejected'))
);

create table if not exists public.stair_lap_segments (
  segment_id uuid primary key default gen_random_uuid(),
  lap_id uuid not null references public.stair_laps(lap_id) on delete cascade,
  segment_type text not null,
  start_checkpoint_id uuid not null references public.stair_checkpoints(checkpoint_id) on delete restrict,
  end_checkpoint_id uuid not null references public.stair_checkpoints(checkpoint_id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null,
  movement_active_seconds integer not null default 0,
  movement_ratio numeric(5, 4) not null default 0,
  sensor_data_coverage numeric(5, 4) not null default 0,
  detected_step_events integer null,
  barometric_elevation_change_m numeric null,
  verification_status text not null default 'pending',
  rejection_reason text null,
  created_at timestamptz not null default now(),
  constraint stair_lap_segments_type_check
    check (segment_type in ('bottom_to_top', 'bottom_to_middle', 'middle_to_top')),
  constraint stair_lap_segments_verification_status_check
    check (verification_status in ('pending', 'verified', 'accepted', 'partially_verified', 'manual_review', 'rejected'))
);

alter table public.activities
  drop constraint if exists activities_stair_session_id_fkey;

alter table public.activities
  add constraint activities_stair_session_id_fkey
  foreign key (stair_session_id) references public.stair_sessions(session_id) on delete set null;

create index if not exists idx_stair_routes_building_status
  on public.stair_routes(building_id, verification_status);

create index if not exists idx_stair_sessions_registration_created
  on public.stair_sessions(registration_id, created_at desc);

create index if not exists idx_stair_laps_session_created
  on public.stair_laps(session_id, created_at);

alter table public.stair_buildings enable row level security;
alter table public.stair_routes enable row level security;
alter table public.stair_checkpoints enable row level security;
alter table public.stair_sessions enable row level security;
alter table public.stair_laps enable row level security;
alter table public.stair_lap_segments enable row level security;

drop policy if exists "stair_buildings_read_authenticated" on public.stair_buildings;
create policy "stair_buildings_read_authenticated"
  on public.stair_buildings for select
  to authenticated
  using (true);

drop policy if exists "stair_routes_read_authenticated" on public.stair_routes;
create policy "stair_routes_read_authenticated"
  on public.stair_routes for select
  to authenticated
  using (true);

drop policy if exists "stair_checkpoints_read_authenticated" on public.stair_checkpoints;
create policy "stair_checkpoints_read_authenticated"
  on public.stair_checkpoints for select
  to authenticated
  using (false);

drop policy if exists "stair_sessions_own_read" on public.stair_sessions;
create policy "stair_sessions_own_read"
  on public.stair_sessions for select
  to authenticated
  using (registration_id = auth.uid()::text);

drop policy if exists "stair_laps_own_read" on public.stair_laps;
create policy "stair_laps_own_read"
  on public.stair_laps for select
  to authenticated
  using (
    exists (
      select 1 from public.stair_sessions s
      where s.session_id = stair_laps.session_id
        and s.registration_id = auth.uid()::text
    )
  );

drop policy if exists "stair_lap_segments_own_read" on public.stair_lap_segments;
create policy "stair_lap_segments_own_read"
  on public.stair_lap_segments for select
  to authenticated
  using (
    exists (
      select 1
      from public.stair_laps l
      join public.stair_sessions s on s.session_id = l.session_id
      where l.lap_id = stair_lap_segments.lap_id
        and s.registration_id = auth.uid()::text
    )
  );

comment on table public.stair_buildings is 'Registered buildings that host QR-verified staircase routes.';
comment on column public.stair_routes.floor_segments is 'Number of floor-to-floor stair sections used to calculate the permanent building stair count.';
comment on column public.stair_routes.bottom_to_top_steps is 'Permanent calculated or verified stair count for the full QR route.';
comment on column public.stair_buildings.qr_custodian_name is 'Person responsible for keeping or hanging the building stair QR tag.';
comment on column public.stair_buildings.qr_custodian_phone is 'Searchable contact for users who need the stair QR tag when it is not posted.';
comment on column public.stair_buildings.qr_custodian_email is 'Optional custodian email for the building stair QR tag.';
comment on table public.stair_routes is 'Fixed measured staircase routes. These route step counts are the competitive scoring source.';
comment on table public.stair_checkpoints is 'Secure QR checkpoint records. QR payloads resolve server-side from token hash.';
comment on table public.stair_sessions is 'A user stair-climb workout session composed of one or more verified ascents.';
comment on table public.stair_laps is 'One attempted ascent within a stair session.';
comment on table public.stair_lap_segments is 'Segment-level verification summaries for QR checkpoint transitions.';
