alter table public.club_membership_request
  add column if not exists club_id uuid null references public.clubs(club_id) on delete set null,
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_by uuid null references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists admin_notes text null,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'club_membership_request_status_check'
  ) then
    alter table public.club_membership_request
      add constraint club_membership_request_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

update public.club_membership_request request
set club_id = clubs.club_id
from public.clubs clubs
where request.club_id is null
  and request.club is not null
  and lower(trim(request.club)) = lower(trim(clubs.club_name));

create index if not exists idx_club_membership_request_club_id
  on public.club_membership_request (club_id);

create index if not exists idx_club_membership_request_status
  on public.club_membership_request (status);
