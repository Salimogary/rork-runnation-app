create table if not exists public.admin_milestones (
  milestone_key text primary key,
  milestone_date date null,
  note text null,
  updated_by uuid null references auth.users (id) on delete set null,
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_admin_milestones_updated_at
  on public.admin_milestones using btree (updated_at desc);
