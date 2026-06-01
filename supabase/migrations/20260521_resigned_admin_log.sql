create table if not exists public.resigned_admin_log (
  resigned_log_id uuid primary key default gen_random_uuid(),
  resigned_user_id uuid not null references auth.users (id) on delete cascade,
  deleted_assignment_id bigint null,
  deleted_role_name text null,
  deleted_country_code text null references public.countries (iso_alpha2),
  deleted_club_id uuid null references public.clubs (club_id) on delete set null,
  deleted_club_name text null,
  assigned_at timestamptz null,
  deleted_by uuid null references auth.users (id) on delete set null,
  deletion_source text not null default 'admin_role_assignment_delete',
  activity_summary jsonb not null default '{}'::jsonb,
  action_counts jsonb not null default '{}'::jsonb,
  recent_activity jsonb not null default '[]'::jsonb,
  active_roles_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_resigned_admin_log_user_created
on public.resigned_admin_log (resigned_user_id, created_at desc);

create index if not exists idx_resigned_admin_log_deleted_by
on public.resigned_admin_log (deleted_by, created_at desc);

create index if not exists idx_resigned_admin_log_role
on public.resigned_admin_log (deleted_role_name, created_at desc);
