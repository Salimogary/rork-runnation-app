alter table public.clubs
  add column if not exists created_by_user_id uuid null references auth.users (id) on delete set null;

create table if not exists public.club_deletion_requests (
  request_id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (club_id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  member_count_at_request integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'auto_actioned', 'cancelled')),
  eligible_at timestamptz not null,
  actioned_by uuid null references auth.users (id) on delete set null,
  actioned_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_club_deletion_one_pending
on public.club_deletion_requests (club_id)
where status = 'pending';

create index if not exists idx_club_deletion_pending
on public.club_deletion_requests (status, eligible_at);
