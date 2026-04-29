begin;

alter table if exists public.events
  add column if not exists approval_status text not null default 'approved',
  add column if not exists approved_at timestamp with time zone null,
  add column if not exists approved_by uuid null;

update public.events
set approval_status = coalesce(nullif(approval_status, ''), 'approved')
where approval_status is null or approval_status = '';

update public.events
set approved_at = coalesce(approved_at, created_at, now())
where approval_status = 'approved'
  and approved_at is null;

alter table if exists public.events
  drop constraint if exists events_approval_status_check;

alter table if exists public.events
  add constraint events_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_approved_by_fkey'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_approved_by_fkey
      foreign key (approved_by)
      references auth.users (id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_events_approval_status
  on public.events (approval_status);

commit;
