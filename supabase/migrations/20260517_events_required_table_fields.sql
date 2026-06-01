begin;

alter table public.events
  add column if not exists event_type text not null default 'same_day',
  add column if not exists registration_closes_at date null,
  add column if not exists event_location text null,
  add column if not exists country text null,
  add column if not exists country_code text null,
  add column if not exists is_virtual boolean not null default false,
  add column if not exists entry text not null default 'free',
  add column if not exists has_medal boolean not null default false,
  add column if not exists approval_status text not null default 'pending',
  add column if not exists club text null;

update public.events
set
  event_name = coalesce(nullif(trim(event_name), ''), 'Untitled Event'),
  starts_at = coalesce(starts_at, current_date),
  ends_at = coalesce(ends_at, starts_at, current_date),
  registration_closes_at = coalesce(registration_closes_at, starts_at::date, current_date),
  event_type = case
    when event_type in ('same_day', 'recurring', 'multiday') then event_type
    when coalesce(starts_at, current_date)::date = coalesce(ends_at, starts_at, current_date)::date then 'same_day'
    else 'multiday'
  end,
  country = coalesce(nullif(trim(country), ''), 'Uganda'),
  country_code = upper(coalesce(nullif(trim(country_code), ''), 'UG')),
  is_virtual = coalesce(is_virtual, false),
  event_location = case
    when coalesce(is_virtual, false) then 'Virtual'
    else coalesce(nullif(trim(event_location), ''), 'TBA')
  end,
  entry = case
    when entry in ('free', 'club_approved', 'paid') then entry
    else 'free'
  end,
  has_medal = coalesce(has_medal, false),
  approval_status = case
    when approval_status in ('pending', 'approved', 'rejected') then approval_status
    else 'pending'
  end,
  club = case
    when organizer is null and nullif(trim(coalesce(club, '')), '') is null then 'RunNation'
    else club
  end
where true;

update public.events
set ends_at = starts_at
where ends_at::date < starts_at::date;

update public.events
set registration_closes_at = ends_at::date
where registration_closes_at > ends_at::date;

alter table public.events
  alter column event_name set not null,
  alter column starts_at set not null,
  alter column ends_at set not null,
  alter column registration_closes_at set not null,
  alter column event_type set not null,
  alter column country set not null,
  alter column country_code set not null,
  alter column is_virtual set not null,
  alter column event_location set not null,
  alter column entry set not null,
  alter column has_medal set not null,
  alter column approval_status set not null;

alter table public.events
  drop constraint if exists events_event_name_required_check,
  add constraint events_event_name_required_check
    check (length(trim(event_name)) > 0),
  drop constraint if exists events_country_required_check,
  add constraint events_country_required_check
    check (length(trim(country)) > 0 and length(trim(country_code)) > 0),
  drop constraint if exists events_location_required_check,
  add constraint events_location_required_check
    check (length(trim(event_location)) > 0),
  drop constraint if exists events_owner_required_check,
  add constraint events_owner_required_check
    check (
      organizer is not null
      or length(trim(coalesce(club, ''))) > 0
    ),
  drop constraint if exists events_date_order_check,
  add constraint events_date_order_check
    check (ends_at::date >= starts_at::date),
  drop constraint if exists events_registration_close_order_check,
  add constraint events_registration_close_order_check
    check (registration_closes_at <= ends_at::date),
  drop constraint if exists events_event_type_check,
  add constraint events_event_type_check
    check (event_type in ('same_day', 'recurring', 'multiday')),
  drop constraint if exists events_entry_check,
  add constraint events_entry_check
    check (entry in ('free', 'club_approved', 'paid')),
  drop constraint if exists events_approval_status_check,
  add constraint events_approval_status_check
    check (approval_status in ('pending', 'approved', 'rejected'));

create index if not exists idx_events_required_list_fields
  on public.events (country_code, is_virtual, event_type, registration_closes_at, ends_at);

commit;
