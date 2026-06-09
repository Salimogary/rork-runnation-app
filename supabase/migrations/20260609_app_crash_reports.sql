create table if not exists public.app_crash_reports (
  report_id uuid primary key,
  auth_user_id uuid,
  registration_id uuid,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  error_name text not null,
  message text not null,
  stack text,
  component_stack text,
  is_fatal boolean not null default false,
  platform text not null,
  os_version text,
  app_version text,
  build_number text,
  source text not null default 'javascript',
  resolved_at timestamptz,
  resolution_notes text
);

create index if not exists app_crash_reports_occurred_at_idx
  on public.app_crash_reports (occurred_at desc);

create index if not exists app_crash_reports_build_idx
  on public.app_crash_reports (platform, build_number, occurred_at desc);

create index if not exists app_crash_reports_registration_idx
  on public.app_crash_reports (registration_id, occurred_at desc);

alter table public.app_crash_reports enable row level security;

comment on table public.app_crash_reports is
  'Crash diagnostics uploaded from local RunNation client logs when connectivity becomes available.';
