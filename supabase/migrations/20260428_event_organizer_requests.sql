do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'club_membership_request_type_check'
  ) then
    alter table public.club_membership_request
      drop constraint club_membership_request_type_check;
  end if;
end $$;

alter table public.club_membership_request
  add constraint club_membership_request_type_check
  check (request_type in ('membership', 'start_club', 'event_organizer'));
