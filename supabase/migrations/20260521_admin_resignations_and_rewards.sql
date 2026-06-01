create table if not exists public.admin_role_resignation_requests (
  request_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  assignment_ids integer[] not null default '{}',
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'approved', 'auto_actioned', 'rejected')),
  eligible_at timestamptz not null,
  actioned_by uuid null references auth.users (id) on delete set null,
  actioned_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_role_resignation_pending
on public.admin_role_resignation_requests (status, eligible_at);

create index if not exists idx_admin_role_resignation_user
on public.admin_role_resignation_requests (user_id, status);

create table if not exists public.user_reward_program (
  reward_id uuid primary key default gen_random_uuid(),
  registration_id uuid null references public.registrations (registration_id) on delete set null,
  nominated_by uuid null references auth.users (id) on delete set null,
  source text not null check (source in ('chat_poll', 'admin_cause', 'super_admin_selection', 'suggestions_contribution')),
  source_reference_id text null,
  reason text not null,
  reward_type text not null check (reward_type in ('sports_gear', 'subscription_quarter')),
  reward_details text null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'fulfilled')),
  approved_by uuid null references auth.users (id) on delete set null,
  approved_at timestamptz null,
  fulfilled_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_reward_program_status
on public.user_reward_program (status, created_at desc);

create index if not exists idx_user_reward_program_registration
on public.user_reward_program (registration_id, created_at desc);
