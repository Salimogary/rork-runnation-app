begin;

alter table public.events
  add column if not exists entry text not null default 'free',
  add column if not exists has_medal boolean not null default false,
  add column if not exists payment_details text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_entry_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_entry_check
      check (entry in ('free', 'club_approved', 'paid'));
  end if;
end $$;

update public.events
set
  entry = coalesce(nullif(trim(entry), ''), 'free'),
  has_medal = coalesce(has_medal, false)
where true;

commit;
