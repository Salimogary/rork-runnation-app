begin;

alter table public.contacts
  add column if not exists full_phone text null;

update public.contacts
set full_phone = trim(
  concat(
    coalesce(nullif(country_code, ''), ''),
    case
      when country_code is not null and phone is not null then ' '
      else ''
    end,
    coalesce(phone::text, '')
  )
)
where full_phone is null
  and (country_code is not null or phone is not null);

alter table public.club_membership_request
  add column if not exists request_type text not null default 'membership',
  add column if not exists proposed_club_name text null,
  add column if not exists proposed_country text null,
  add column if not exists proposed_description text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'club_membership_request_type_check'
  ) then
    alter table public.club_membership_request
      add constraint club_membership_request_type_check
      check (request_type in ('membership', 'start_club'));
  end if;
end $$;

update public.club_membership_request
set request_type = 'start_club',
    proposed_club_name = coalesce(proposed_club_name, nullif(club, 'new request'))
where lower(coalesce(club, '')) = 'new request';

commit;
