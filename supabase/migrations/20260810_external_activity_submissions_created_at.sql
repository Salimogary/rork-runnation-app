alter table public.external_activity_submissions
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_external_activity_submissions_created_at
  on public.external_activity_submissions using btree (created_at desc);

